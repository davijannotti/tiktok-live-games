import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMode, towerHeights } from '../public/games/torcida-tower/mode.js';

function screen(reducedMotion = false) {
  const nodes = [], animations = [];
  const document = { createElement() {
    const classes = new Set();
    const el = { ownerDocument: document, children: [], style: {}, textContent: '',
      classList: { toggle(name, yes) { yes ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) },
      setAttribute() {}, append(child) { this.children.push(child); child.parent = this; },
      remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
      animate() { const animation = { cancel() { this.cancelled = true; } }; animations.push(animation); return animation; },
    };
    nodes.push(el);
    return el;
  } };
  const root = document.createElement('div');
  const mode = createMode(root, { reducedMotion });
  return { root, mode, nodes, animations, find: name => nodes.filter(node => node.className?.split(' ').includes(name)) };
}

test('tower geometry preserves score order, ties and zero while fitting safe canvas at huge scores', () => {
  assert.deepEqual(towerHeights({ lula: 0, bolsonaro: 0 }), { lula: 0, bolsonaro: 0 });
  assert.deepEqual(towerHeights({ lula: 1, bolsonaro: 2 }), { lula: 10, bolsonaro: 20 });
  assert.deepEqual(towerHeights({ lula: 600, bolsonaro: 600 }), { lula: 120, bolsonaro: 120 });
  const heights = towerHeights({ lula: Number.MAX_SAFE_INTEGER, bolsonaro: Number.MAX_SAFE_INTEGER / 2 });
  assert.equal(heights.lula, 120);
  assert.equal(heights.bolsonaro, 60);
  assert.ok(heights.lula + 35 + 54 <= 214, 'face stays below heading and within playfield');
});

test('tower displays exact score, winner, tie and clean reset from shared state', () => {
  const ui = screen();
  ui.mode.render({ scores: { lula: 100, bolsonaro: 50 }, phase: 'playing' });
  assert.equal(ui.find('torcida-tower__points')[0].textContent, '100');
  assert.ok(ui.find('torcida-tower__lane')[0].classList.contains('torcida-tower__lane--leading'));
  ui.mode.render({ scores: { lula: 100, bolsonaro: 150 }, phase: 'result', winner: 'bolsonaro' });
  assert.ok(ui.find('torcida-tower__lane')[1].classList.contains('torcida-tower__lane--winner'));
  assert.match(ui.find('torcida-tower__status')[0].textContent, /FLÁVIO/);
  ui.mode.render({ scores: { lula: 150, bolsonaro: 150 }, phase: 'result', winner: null });
  assert.match(ui.find('torcida-tower__status')[0].textContent, /EMPATE/);
  assert.ok(ui.find('torcida-tower__lane').every(lane => !lane.classList.contains('torcida-tower__lane--leading') && !lane.classList.contains('torcida-tower__lane--winner')));
  ui.mode.render({ scores: { lula: 0, bolsonaro: 0 }, phase: 'playing' });
  assert.ok(ui.find('torcida-tower__stack').every(stack => stack.style.height === '0px'));
});

test('tower point effects clean up on finish/destroy and never animate with reduced motion', () => {
  const ui = screen();
  ui.mode.onScore({ team: 'lula', points: 10 });
  const burst = ui.find('torcida-tower__burst')[0];
  assert.equal(burst.textContent, '+10 BLOCOS');
  ui.animations[1].onfinish();
  assert.ok(!burst.parent.children.includes(burst));
  ui.mode.destroy();
  assert.equal(ui.root.children.length, 0);
  assert.equal(ui.animations[0].cancelled, true);
  ui.mode.onScore({ team: 'lula', points: 1 });
  assert.equal(ui.animations.length, 2);
  const still = screen(true);
  still.mode.onScore({ team: 'bolsonaro', points: 1 });
  assert.equal(still.animations.length, 0);
  assert.equal(still.find('torcida-tower__burst').length, 0);
  still.mode.destroy();
});
