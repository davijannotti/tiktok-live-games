import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../public/lib/tiktok-bridge.js', import.meta.url), 'utf8');
test('bridge reports initial, reused and reconnected lives once while preserving event payloads', () => {
  const handlers = {};
  const socket = { on: (name, handler) => { handlers[name] = handler; }, emit() {} };
  const window = { addEventListener() {}, location: { origin: 'http://localhost' } };
  runInNewContext(source, { window, io: () => socket, console });
  const bridge = window.TikTokBridge;
  const connected = [], gifts = [], disconnected = [];
  bridge.on('connected', data => connected.push(data));
  bridge.on('gift', data => gifts.push(data));
  bridge.on('disconnected', () => disconnected.push(true));
  bridge.connect('alice');
  handlers.connect();
  handlers.tiktok_connected({ roomId: 'first' });
  handlers['room-joined']({ room: 'alice' });
  assert.equal(connected.length, 1);
  assert.equal(connected[0].room, 'alice');
  assert.equal(connected[0].message, 'Joined room: alice');
  const gift = { giftId: 5655, giftValue: 1, repeatCount: 1 };
  handlers.tiktok_gift(gift);
  assert.equal(gifts[0], gift);
  handlers.tiktok_disconnected();
  handlers.tiktok_reconnecting({ attempt: 1, delayMs: 2000 });
  handlers.tiktok_connected({ roomId: 'second' });
  assert.equal(disconnected.length, 1);
  assert.equal(connected.length, 2);
  assert.equal(connected[1].roomId, 'second');
  // A new Socket.io session can reuse an already-open TikTok connection.
  handlers.connect();
  handlers['room-joined']({ room: 'alice' });
  assert.equal(connected.length, 3);
});
