import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class InteractionStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), {recursive:true});
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS supporters (
        room TEXT NOT NULL, id TEXT NOT NULL, nickname TEXT NOT NULL, avatar TEXT NOT NULL,
        comments INTEGER NOT NULL DEFAULT 0, gifts INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (room, id));
      CREATE TABLE IF NOT EXISTS received_events (
        room TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(room, kind, id));`);
    this.seen = this.db.prepare('INSERT OR IGNORE INTO received_events VALUES (?, ?, ?)');
    this.upsert = this.db.prepare(`INSERT INTO supporters (room,id,nickname,avatar,comments,gifts,likes)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(room,id) DO UPDATE SET nickname=excluded.nickname,
      avatar=CASE WHEN excluded.avatar='' THEN supporters.avatar ELSE excluded.avatar END,
      comments=supporters.comments+excluded.comments, gifts=supporters.gifts+excluded.gifts,
      likes=supporters.likes+excluded.likes
      WHERE supporters.comments<=9007199254740991-excluded.comments
      AND supporters.gifts<=9007199254740991-excluded.gifts AND supporters.likes<=9007199254740991-excluded.likes`);
    this.top = Object.fromEntries(['comments','gifts','likes'].map(metric => [metric,
      this.db.prepare(`SELECT id,nickname,avatar AS profilePictureUrl,comments,gifts,likes FROM supporters
        WHERE room=? AND ${metric}>0 ORDER BY ${metric} DESC,id ASC LIMIT 3`)]));
  }

  record(room, kind, data, eventId = '') {
    const id = typeof data.user?.uniqueId === 'string' ? data.user.uniqueId.trim().toLowerCase() : '';
    if (!id) return;
    let amount;
    if (kind === 'chat' && typeof data.comment === 'string' && data.comment.trim()) amount = 1;
    else if (kind === 'like') amount = data.likeCount;
    else if (kind === 'gift') {
      if (data.streakType === 1 && !data.repeatEnd) return;
      if (!Number.isSafeInteger(data.giftValue) || data.giftValue <= 0 ||
          !Number.isSafeInteger(data.repeatCount) || data.repeatCount <= 0) return;
      amount = data.giftValue * data.repeatCount;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    const avatar = typeof data.user.profilePictureUrl === 'string' ? data.user.profilePictureUrl : '';
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (eventId && !this.seen.run(room, kind, String(eventId)).changes) {
        this.db.exec('COMMIT');
        return;
      }
      this.upsert.run(room, id, data.user.nickname || id, avatar,
        kind === 'chat' ? amount : 0, kind === 'gift' ? amount : 0, kind === 'like' ? amount : 0);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  leaderboards(room) {
    return Object.fromEntries(Object.entries(this.top).map(([metric, statement]) => [metric, statement.all(room)]));
  }

  close() { this.db.close(); }
}
