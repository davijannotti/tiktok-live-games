import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { InteractionStore } from '../src/lib/interactionStore.js';

test('SQLite preserves real-user totals, avatars and event deduplication across reopen with isolated rooms', t => {
  const folder = mkdtempSync(join(tmpdir(), 'live-rankings-'));
  t.after(() => rmSync(folder, {recursive:true, force:true}));
  const file = join(folder, 'rankings.sqlite');
  let store = new InteractionStore(file);
  const user = {uniqueId:'Ana', nickname:'Ana', profilePictureUrl:'https://example.com/ana.png'};
  store.record('alice', 'chat', {user, comment:'13.13'}, 'chat1');
  store.record('alice', 'chat', {user, comment:'13.13'}, 'chat1');
  const gift = {user, giftValue:10, repeatCount:3, streakType:1, repeatEnd:false};
  store.record('alice', 'gift', gift, 'gift1');
  store.record('alice', 'gift', {...gift, repeatEnd:true}, 'gift1');
  store.record('alice', 'gift', {...gift, repeatEnd:true}, 'gift1');
  store.record('alice', 'like', {user, likeCount:4, totalLikeCount:500}, 'like1');
  store.record('bob', 'like', {user, likeCount:10}, 'like1');
  for (const likeCount of [-1, 0, Infinity, 1.5]) store.record('alice', 'like', {user, likeCount});
  store.record('alice', 'chat', {user:{nickname:'No ID'}, comment:'22'});
  store.record('alice', 'share', {user});
  store.close();
  store = new InteractionStore(file);
  t.after(() => store.close());
  store.record('alice', 'gift', {...gift, repeatEnd:true}, 'gift1');
  store.record('alice', 'chat', {user:{...user, nickname:'Ana nova', profilePictureUrl:''}, comment:'oi'}, 'chat2');
  const boards = store.leaderboards('alice');
  assert.equal(boards.comments[0].comments, 2);
  assert.equal(boards.gifts[0].gifts, 30);
  assert.equal(boards.likes[0].likes, 4);
  assert.equal(boards.likes[0].nickname, 'Ana nova');
  assert.equal(boards.likes[0].profilePictureUrl, user.profilePictureUrl);
  assert.equal(store.leaderboards('bob').likes[0].likes, 10);
  assert.deepEqual(store.leaderboards('unknown'), {comments:[], gifts:[], likes:[]});
});

test('SQLite returns only top three with deterministic ties and parameterized user strings', t => {
  const store = new InteractionStore(':memory:');
  t.after(() => store.close());
  for (let i=0; i<5; i++) store.record('alice', 'like', {
    user:{uniqueId:`user${i}`, nickname:"'); DROP TABLE supporters; --"}, likeCount:i+1,
  }, String(i));
  assert.deepEqual(store.leaderboards('alice').likes.map(p => p.likes), [5,4,3]);
  assert.equal(store.leaderboards('bob').likes.length, 0);
});
