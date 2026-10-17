import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMode } from '../public/games/torcida-tug/mode.js';

function screen(reducedMotion = false) {
  const nodes = new Map(), animations = [];
  function element() {
    const classes = new Set();
    return {
      children: [], style: { setProperty(name, value) { this[name] = value; } },
      classList: { add: key => classes.add(key), contains: key => classes.has(key), toggle(key, enabled) { enabled ? classes.add(key) : classes.delete(key); } },
      setAttribute() {},
      append(child) { this.children.push(child); child.parent = this; },
      remove() { this.parent.children = this.parent.children.filter(node => node !== this); },
      querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); },
      animate(frames, options) { const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } }; animations.push(animation); return animation; },
    };
  }
  const root = element(); root.ownerDocument = { createElement: element };
  const mode = createMode(root, { reducedMotion });
  return { root, mode, view: root.children[0], nodes, animations };
}

test('tug uses proportional advantage, ties and authoritative winner without mutating scores', () => {
  const { mode, view, nodes } = screen();
  const scores = Object.freeze({ lula: 30, bolsonaro: 10 });
  mode.render({ scores, remaining: 40000, phase: 'playing', winner: null });
  assert.equal(view.style['--tug-shift'], '-23px');
  assert.equal(nodes.get('.torcida-tug-score-lula').textContent, '30');
  assert.match(nodes.get('.torcida-tug-status').textContent, /Lula na frente/);
  mode.render({ scores: { lula: 0, bolsonaro: 0 }, phase: 'playing', remaining: 30000 });
  assert.equal(view.style['--tug-meter'], '50%');
  assert.match(nodes.get('.torcida-tug-status').textContent, /empatado/);
  mode.render({ scores, phase: 'result', winner: 'bolsonaro' });
  assert.ok(view.classList.contains('torcida-tug-winner-bolsonaro'));
  assert.match(nodes.get('.torcida-tug-status').textContent, /Flávio puxou a vitória/);
  mode.render({ scores, phase: 'result', winner: null });
  assert.ok(!view.classList.contains('torcida-tug-winner-bolsonaro'));
  assert.match(nodes.get('.torcida-tug-status').textContent, /Empatou/);
});

test('tug reactions cancel overlapping motion and destroy releases animations and DOM', () => {
  const { mode, root, animations } = screen();
  mode.onScore({ team: 'lula', points: 10 });
  assert.equal(animations.length, 2);
  mode.onScore({ team: 'bolsonaro', points: 1 });
  assert.ok(animations.slice(0, 2).every(animation => animation.cancelled));
  assert.equal(animations.length, 4);
  mode.destroy();
  assert.ok(animations.every(animation => animation.cancelled));
  assert.equal(root.children.length, 0);
  mode.onScore({ team: 'lula' });
  assert.equal(animations.length, 4);
});

test('tug respects reduced motion and never pulls during result', () => {
  const reduced = screen(true);
  reduced.mode.onScore({ team: 'lula' });
  assert.equal(reduced.animations.length, 0);
  assert.ok(reduced.view.classList.contains('torcida-tug-reduced'));
  const ui = screen();
  ui.mode.render({ scores: { lula: 1, bolsonaro: 0 }, phase: 'result', winner: 'lula' });
  ui.mode.onScore({ team: 'lula' });
  assert.equal(ui.animations.length, 0);
});
