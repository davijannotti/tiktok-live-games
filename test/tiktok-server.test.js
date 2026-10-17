import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { test } from 'node:test';
import { UrnaBattle } from '../public/games/urna-battle/engine.js';

test('PirateTok events travel through the actual server to the game, with idempotent room membership', { timeout: 10000 }, async t => {
  const preload = `import { TikTokLiveClient } from ${JSON.stringify(import.meta.resolve('piratetok-live-js'))};
    TikTokLiveClient.prototype.connect = async function () {
      setImmediate(() => this.emit('gift', { common: { msgId: '123' }, user: { uniqueId: 'tester', nickname: 'Tester' },
        giftId: 5655, repeatCount: 1, repeatEnd: 1, gift: { name: 'Rose', diamondCount: 1, type: 1 } }));
      return 'test-room';
    };`;
  const child = spawn(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'src/server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '0', RANKINGS_DB: ':memory:' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGKILL'));
  let output = '', errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/localhost:(\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('exit', () => reject(new Error(errors)));
  });
  const socket = new WebSocket(`ws://localhost:${port}/socket.io/?EIO=4&transport=websocket`);
  t.after(() => socket.close());
  const packets = new EventEmitter();
  socket.addEventListener('message', ({ data }) => {
    const message = String(data);
    if (message.startsWith('0')) socket.send('40');
    else if (message === '2') socket.send('3');
    else if (message.startsWith('40')) packets.emit('ready');
    else if (message.startsWith('42')) {
      const [event, payload] = JSON.parse(message.slice(2));
      packets.emit(event, payload);
    }
  });
  await once(packets, 'ready');
  const join = async username => {
    const joined = once(packets, 'room-joined');
    socket.send(`42${JSON.stringify(['join-room', username])}`);
    await joined;
  };
  const gift = once(packets, 'tiktok_gift');
  await join('alice');
  const [payload] = await gift;
  const game = new UrnaBattle(0);
  assert.equal(game.receiveGift(payload, 0).points, 1);
  assert.equal(game.receiveGift(payload, 0), null);
  await join('alice');
  const ranking = await (await fetch(`http://localhost:${port}/api/leaderboards/alice`)).json();
  assert.equal(ranking.gifts[0].id, 'tester');
  assert.equal(ranking.gifts[0].gifts, 1);
  assert.deepEqual((await (await fetch(`http://localhost:${port}/api/leaderboards/unknown`)).json()).gifts, []);
  assert.equal((await fetch(`http://localhost:${port}/api/leaderboards/bad!`)).status, 400);
  const stats = async () => (await fetch(`http://localhost:${port}/api/stats`)).json();
  assert.equal((await stats()).rooms.alice, 1);
  await join('bob');
  assert.equal((await stats()).rooms.alice, 0);
  assert.equal((await stats()).rooms.bob, 1);
  socket.send(`42${JSON.stringify(['leave-room', 'bob'])}`);
  // Ping acknowledgement is ordered after leave-room on this socket.
  const pong = once(packets, 'pong');
  socket.send('42["ping"]');
  await pong;
  assert.equal((await stats()).rooms.bob, 0);
});
