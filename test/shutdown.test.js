import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`server exits with an open WebSocket on ${signal}`, { timeout: 10000 }, async t => {
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: '0', RANKINGS_DB: ':memory:' },
      stdio: ['ignore', 'pipe', 'pipe'],
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
      child.once('exit', () => reject(new Error(`Early exit: ${errors}`)));
    });
    const socket = new WebSocket(`ws://localhost:${port}/socket.io/?EIO=4&transport=websocket`);
    t.after(() => socket.close());
    await once(socket, 'open');
    const exited = once(child, 'exit');
    // Repeated signals must not register additional close callbacks.
    for (let i = 0; i < 12; i++) child.kill(signal);
    const [code, exitSignal] = await exited;
    assert.equal(code, 0, errors);
    assert.equal(exitSignal, null);
    assert.equal((output.match(/Shutting down/g) || []).length, 1);
    assert.match(output, /Goodbye/);
    assert.doesNotMatch(errors, /MaxListenersExceededWarning/);
  });
}
