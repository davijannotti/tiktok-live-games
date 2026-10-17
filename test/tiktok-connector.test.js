import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { TikTokLiveClient } from 'piratetok-live-js';
import service from '../src/services/TikTokService.js';
import { normalizeChat, normalizeGift, normalizeLike, normalizeShare } from '../src/lib/tiktokEventNormalizer.js';
import { withoutTikTokRoomCache } from '../src/lib/tiktokRoomCache.js';
import { UrnaBattle } from '../public/games/urna-battle/engine.js';

const user = { uniqueId: 'tester', nickname: 'Tester', avatarThumb: { urlList: ['https://example.com/avatar'] } };
const gift = (extra = {}) => ({ common: { msgId: '1234567890123456789' }, user, giftId: 5655,
  repeatCount: 3, repeatEnd: 1, gift: { name: 'Rose', diamondCount: 1, type: 1 }, ...extra });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function socketRooms() {
  const events = [];
  return { events, to: room => ({ emit: (event, data) => events.push({ room, event, data }) }) };
}

beforeEach(() => {
  for (const username of service.connections.keys()) service.disconnect(username);
  service.roomClients.clear();
  service.reconnectState.clear();
  service.shuttingDown = false;
});
after(() => service.shutdown());

test('PirateTok normalizers preserve the public chat, like, share and user payloads', () => {
  const chat = normalizeChat({ user, content: ' VN ' });
  assert.equal(chat.comment, 'vn');
  assert.deepEqual(chat.user, { uniqueId: 'tester', nickname: 'Tester', profilePictureUrl: 'https://example.com/avatar' });
  const like = normalizeLike({ user, count: '3', total: '100' });
  assert.equal(like.likeCount, 3);
  assert.equal(like.totalLikeCount, 100);
  assert.deepEqual(normalizeShare({ user }).user, chat.user);
});

test('gift values, final combos and message IDs survive normalization and score only once', () => {
  const game = new UrnaBattle(0);
  assert.equal(game.receiveGift(normalizeGift(gift({ repeatEnd: 0 })), 0), null);
  const final = normalizeGift(gift());
  assert.equal(final.giftName, 'Rose');
  assert.equal(final.giftId, 5655);
  assert.equal(final.giftValue, 1);
  assert.equal(final.streakType, 1);
  assert.equal(final.eventId, '1234567890123456789');
  assert.equal(game.receiveGift(final, 0).points, 3);
  assert.equal(game.receiveGift(final, 0), null);
  const perfume = normalizeGift(gift({ common: { msgId: '2' }, giftId: 99, repeatCount: 2,
    gift: { name: 'Heart', diamondCount: 20, type: 0 } }));
  assert.equal(perfume.giftType, 'medium');
  assert.equal(game.receiveGift(perfume, 0).points, 40);
  const missingCost = normalizeGift(gift({ common: { msgId: '3' }, gift: { name: 'Rose' } }));
  assert.equal(game.receiveGift(missingCost, 0), null);
});

test('room cache workaround only changes TikTok room discovery and preserves request options', async () => {
  const calls = [];
  const fetch = withoutTikTokRoomCache(async (...args) => { calls.push(args); return 'response'; });
  const options = { headers: { 'User-Agent': 'test' } };
  assert.equal(await fetch('https://www.tiktok.com/api-live/user/room?uniqueId=test&staleTime=600000', options), 'response');
  assert.equal(calls[0][0].searchParams.get('uniqueId'), 'test');
  assert.equal(calls[0][0].searchParams.get('staleTime'), '0');
  assert.ok(calls[0][0].searchParams.get('_'));
  assert.equal(calls[0][1], options);
  const other = new Request('https://example.com/api-live/user/room', { headers: { test: 'kept' } });
  await fetch(other);
  assert.equal(calls[1][0], other);
  const request = new Request('https://www.tiktok.com/api-live/user/room?uniqueId=test', { headers: { test: 'kept' } });
  await fetch(request);
  assert.equal(calls[2][0].headers.get('test'), 'kept');
  assert.equal(new URL(calls[2][0].url).searchParams.get('staleTime'), '0');
});

test('simultaneous viewers share a pending connection; connected waits for the handshake; rooms stay isolated', async t => {
  const io = socketRooms();
  let opened;
  const connect = t.mock.method(TikTokLiveClient.prototype, 'connect', function () {
    this.emit('connected', { roomId: 'premature' });
    return new Promise(resolve => { opened = resolve; });
  });
  const first = service.connect('alice', io);
  const second = service.connect('alice', io);
  await flush();
  assert.equal(connect.mock.callCount(), 1);
  assert.equal(io.events.length, 0);
  const connection = service.connections.get('alice').connection;
  connection.emit('chat', { user, content: '13' });
  connection.emit('gift', gift());
  connection.emit('like', { user, count: 2, total: 10 });
  connection.emit('share', { user });
  assert.deepEqual(io.events.map(e => e.event), ['tiktok_chat', 'tiktok_gift', 'tiktok_like', 'tiktok_share']);
  assert.ok(io.events.every(e => e.room === 'alice'));
  opened('room-alice');
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(io.events.at(-1).event, 'tiktok_connected');
  assert.equal(io.events.at(-1).data.roomId, 'room-alice');
  assert.equal(await service.connect('alice', io), true);
  assert.equal(connect.mock.callCount(), 1);
});

test('a dropped connection retries with a fresh room lookup; manual disconnect cancels retries and late events', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => .5);
  const connect = t.mock.method(TikTokLiveClient.prototype, 'connect', async () => 'room');
  const io = socketRooms();
  service.addClientToRoom('alice');
  await service.connect('alice', io);
  const old = service.connections.get('alice').connection;
  old.emit('disconnected');
  assert.equal(io.events.at(-1).event, 'tiktok_reconnecting');
  t.mock.timers.tick(2000);
  await flush();
  assert.equal(connect.mock.callCount(), 2);
  assert.equal(io.events.at(-1).event, 'tiktok_connected');
  const count = io.events.length;
  old.emit('gift', gift());
  old.emit('disconnected');
  assert.equal(io.events.length, count);
  service.connections.get('alice').connection.emit('disconnected');
  service.disconnect('alice');
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(connect.mock.callCount(), 2);
});

test('initial failures retry without overlapping loops and stop after the retry budget', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => .5);
  const connect = t.mock.method(TikTokLiveClient.prototype, 'connect', async function () {
    this.emit('disconnected');
    throw new Error('offline');
  });
  const io = socketRooms();
  service.addClientToRoom('alice');
  assert.equal(await service.connect('alice', io), false);
  for (const delay of [2000, 4000, 8000, 16000, 32000]) {
    t.mock.timers.tick(delay);
    await flush();
  }
  assert.equal(connect.mock.callCount(), 6);
  assert.equal(service.connections.size, 0);
  assert.equal(service.reconnectState.size, 0);
  assert.match(io.events.at(-1).data.message, /Reconnect failed after 5 attempts/);
});

test('shutdown during connect suppresses late success and disconnects the client', async t => {
  let opened;
  t.mock.method(TikTokLiveClient.prototype, 'connect', () => new Promise(resolve => { opened = resolve; }));
  const disconnect = t.mock.method(TikTokLiveClient.prototype, 'disconnect', () => {});
  const io = socketRooms();
  const pending = service.connect('alice', io);
  await flush();
  service.shutdown();
  opened('late-room');
  assert.equal(await pending, false);
  assert.equal(io.events.length, 0);
  assert.equal(service.connections.size, 0);
  assert.ok(disconnect.mock.callCount() >= 1);
});

test('hung handshakes time out and release the connection', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(TikTokLiveClient.prototype, 'connect', () => new Promise(() => {}));
  const disconnect = t.mock.method(TikTokLiveClient.prototype, 'disconnect', () => {});
  const io = socketRooms();
  const pending = service.connect('alice', io);
  await flush();
  t.mock.timers.tick(45000);
  assert.equal(await pending, false);
  assert.equal(service.connections.size, 0);
  assert.match(io.events.at(-1).data.message, /timed out/);
  assert.ok(disconnect.mock.callCount() >= 1);
});

test('events from two active streamers stay in their respective Socket.io rooms', async t => {
  t.mock.method(TikTokLiveClient.prototype, 'connect', async () => 'room');
  const io = socketRooms();
  await Promise.all([service.connect('alice', io), service.connect('bob', io)]);
  io.events.length = 0;
  service.connections.get('alice').connection.emit('gift', gift());
  service.connections.get('bob').connection.emit('chat', { user, content: '22' });
  assert.deepEqual(io.events.map(({room, event}) => [room, event]), [
    ['alice', 'tiktok_gift'], ['bob', 'tiktok_chat'],
  ]);
});
