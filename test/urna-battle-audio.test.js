import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../public/games/urna-battle/audio.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export class', 'class');
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function player({ blocked = false, musicError = false } = {}) {
  const voices = [], timers = new Map(), listeners = {};
  let nextTimer = 0;
  const music = { paused: true,
    async play() { if (blocked || musicError) throw new Error('Unavailable'); this.paused = false; },
    pause() { this.paused = true; },
  };
  const gain = () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect() {}, disconnect() {},
  });
  class AudioContext {
    state = 'suspended'; currentTime = 10; destination = {};
    async resume() { if (blocked) throw new Error('NotAllowedError'); this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    createGain = gain;
    createOscillator() {
      const voice = { frequency: {}, connect() {}, disconnect() { this.disconnected = true; },
        start(time) { this.startsAt = time; }, stop(time) { this.stopsAt = time; },
      };
      voices.push(voice);
      return voice;
    }
  }
  const GameAudio = runInNewContext(`${source}\nGameAudio;`, {
    document: { getElementById: id => id === 'background-music' ? music : null }, AudioContext,
    Math: Object.assign(Object.create(Math), {random:()=>.999}),
    addEventListener: (event, callback) => { listeners[event] = callback; },
    removeEventListener: event => { delete listeners[event]; },
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id),
  });
  return { audio: new GameAudio(), music, voices, timers, listeners, allow: () => { blocked = false; } };
}

test('audio attempts autoplay with fixed low music and effects levels, without on-screen controls', async () => {
  const { audio, music, voices } = player();
  audio.play('win');
  assert.equal(voices.length, 0);
  await flush();
  assert.equal(audio.enabled, true);
  assert.equal(music.paused, false);
  assert.equal(audio.effects.gain.value, .3);
  assert.equal(music.volume, .18);
  audio.clearEffects();
  audio.play('point');
  assert.equal(audio.voices.size, 2);
  for (const voice of audio.voices) {
    assert.ok(voice.stopsAt > voice.startsAt);
    voice.onended();
    assert.equal(voice.disconnected, true);
  }
  const html = readFileSync(new URL('../public/games/urna-battle/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /audio-toggle|music-volume|effects-volume|audio-controls|audio-status/);
});

test('major cues duck the music once and restore its default volume', async () => {
  const { audio, music, timers } = player();
  await flush();
  audio.play('big');
  assert.equal(music.volume, .18 * .35);
  audio.play('comeback');
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(music.volume, .18);
  audio.play('win');
  audio.clearEffects();
  assert.equal(audio.duckTimer, null);
  assert.equal(audio.voices.size, 0);
  assert.equal(music.volume, .18);
});

test('autoplay rejection stays silent and retries after a gesture without replaying blocked cues', async () => {
  const { audio, music, voices, listeners, allow } = player({ blocked: true });
  await flush();
  assert.equal(audio.enabled, false);
  assert.equal(music.paused, true);
  audio.play('win');
  assert.equal(voices.length, 0);
  allow();
  listeners.pointerdown();
  await flush();
  assert.equal(audio.enabled, true);
  assert.equal(music.paused, false);
  assert.equal(voices.length, 3); // Startup cue only, not the blocked victory.
  listeners.keydown();
  await flush();
  assert.equal(voices.length, 3);
});

test('missing music does not disable game sound effects', async () => {
  const { audio } = player({ musicError: true });
  await flush();
  assert.equal(audio.enabled, true);
  audio.clearEffects();
  audio.play('point');
  assert.equal(audio.voices.size, 2);
});

test('leaving the page stops playback, releases voices and prevents late restarts', async () => {
  const { audio, music, voices, listeners } = player();
  await flush();
  listeners.pagehide();
  assert.equal(audio.enabled, false);
  assert.equal(audio.context.state, 'suspended');
  assert.equal(audio.voices.size, 0);
  assert.equal(music.paused, true);
  assert.equal(listeners.pointerdown, undefined);
  const count = voices.length;
  await audio.start();
  audio.play('point');
  assert.equal(voices.length, count);
});

test('a browser-suspended effects context resumes on the next gesture', async () => {
  const { audio, listeners, voices } = player();
  await flush();
  const count = voices.length;
  audio.context.state = 'suspended';
  listeners.pointerdown();
  await flush();
  assert.equal(audio.context.state, 'running');
  assert.equal(voices.length, count);
  audio.play('point');
  assert.equal(voices.length, count + 2);
});

test('playlist shuffles without repeats until exhausted, avoids boundary repeats and stops advancing on page exit', async () => {
  const {audio, music, listeners} = player();
  await flush();
  const played = [audio.currentTrack.file];
  assert.equal(music.loop, false);
  for (let i=0; i<3; i++) { audio.nextTrack(); await flush(); played.push(audio.currentTrack.file); }
  assert.equal(new Set(played).size, 4);
  const last = audio.currentTrack.file;
  audio.nextTrack();
  assert.notEqual(audio.currentTrack.file, last);
  const ended = music.onended;
  listeners.pagehide();
  const stoppedAt = music.src;
  ended();
  assert.equal(music.src, stoppedAt);
  assert.equal(music.onended, null);
  assert.equal(music.onerror, null);
});

test('failed playlist assets are skipped with bounded attempts while effects remain usable', async () => {
  const {audio, music} = player();
  await flush();
  const failed = new Set();
  for (let i=0; i<4; i++) { failed.add(audio.currentTrack.file); music.onerror(); await flush(); }
  assert.equal(failed.size, 4);
  assert.equal(audio.failedTracks.size, 4);
  const last = music.src;
  music.onerror();
  assert.equal(music.src, last);
  audio.clearEffects();
  audio.play('point');
  assert.equal(audio.voices.size, 2);
});
