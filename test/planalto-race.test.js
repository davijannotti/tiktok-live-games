import test from 'node:test';
import assert from 'node:assert/strict';
import { racePositions, createMode } from '../public/games/planalto-race/mode.js';

test('corrida mantém progresso crescente pelos pontos e só cruza chegada no resultado', () => {
  assert.deepEqual(racePositions({ lula: 0, bolsonaro: 0 }, 'playing', null), { lula: 0, bolsonaro: 0 });
  const positions = racePositions({ lula: 50, bolsonaro: 10 }, 'playing', null);
  assert.ok(positions.lula > positions.bolsonaro);
  assert.ok(positions.lula < 1);
  assert.ok(racePositions({ lula: 100, bolsonaro: 10 }, 'playing', null).lula > positions.lula);
  assert.equal(racePositions({ lula: 50, bolsonaro: 10 }, 'result', 'lula').lula, 1);
  const tie = racePositions({ lula: 10, bolsonaro: 10 }, 'result', null);
  assert.equal(tie.lula, tie.bolsonaro);
  assert.ok(tie.lula < 1);
});

function fakeNode() {
  const classes = new Set();
  return {
    style: {}, textContent: '', innerHTML: '',
    classList: {
      add: (...items) => items.forEach(item => classes.add(item)),
      remove: (...items) => items.forEach(item => classes.delete(item)),
      toggle: (item, enabled) => enabled ? classes.add(item) : classes.delete(item),
      contains: item => classes.has(item)
    },
    children: new Map(),
    querySelector(selector) {
      if (!this.children.has(selector)) this.children.set(selector, fakeNode());
      return this.children.get(selector);
    },
    replaceChildren() { this.innerHTML = ''; }
  };
}

test('renderer mostra vencedor oficial, recebe impulso e limpa efeitos ao sair', () => {
  const root = fakeNode();
  const mode = createMode(root, { reducedMotion: true });
  assert.ok(root.classList.contains('planalto-race-reduced'));
  mode.render({ scores: { lula: 1, bolsonaro: 10 }, phase: 'playing', winner: null });
  assert.match(root.querySelector('.planalto-race-status').textContent, /FLÁVIO NA FRENTE/);
  mode.onScore({ team: 'lula', kind: 'chat', points: 1 });
  const car = root.querySelector('[data-car="lula"]');
  assert.equal(car.querySelector('.planalto-race-boost').textContent, 'VAI!');
  mode.onScore({ team: 'bolsonaro', gift: 'Tiny Diny', points: 10 });
  assert.equal(root.querySelector('[data-car="bolsonaro"]').querySelector('.planalto-race-boost').textContent, 'TURBO!');
  mode.render({ scores: { lula: 1, bolsonaro: 10 }, phase: 'result', winner: 'bolsonaro' });
  assert.equal(root.querySelector('[data-car="bolsonaro"]').style.left, '100%');
  assert.equal(root.querySelector('[data-score="bolsonaro"]').textContent, '10');
  assert.ok(root.querySelector('[data-car="bolsonaro"]').classList.contains('planalto-race-winner'));
  mode.destroy();
  assert.equal(root.innerHTML, '');
  assert.equal(root.classList.contains('planalto-race'), false);
  mode.render({ scores: { lula: 0, bolsonaro: 0 }, phase: 'playing', winner: null });
  mode.onScore({ team: 'lula', points: 1 });
  assert.equal(root.innerHTML, '');
});


test('tempo avança os dois carros sem alterar placar nem ordem da torcida', () => {
  const scores = Object.freeze({ lula: 0, bolsonaro: 0 });
  const half = racePositions(scores, 'playing', null, .5);
  const end = racePositions(scores, 'playing', null, 1);
  assert.equal(half.lula, half.bolsonaro);
  assert.ok(half.lula > 0);
  assert.ok(end.lula > half.lula);
  assert.equal(end.lula, .55);
  for (const progress of [0, .25, .5, 1, 2]) {
    const positions = racePositions({ lula: 30, bolsonaro: 1 }, 'playing', null, progress);
    assert.ok(positions.lula > positions.bolsonaro);
    assert.ok(positions.lula < .82);
  }
  const root = fakeNode();
  const mode = createMode(root);
  mode.render({ scores, phase: 'playing', winner: null, elapsed: 50, duration: 100 });
  assert.ok(parseFloat(root.querySelector('[data-car="lula"]').style.left) > 0);
  assert.equal(root.querySelector('[data-score="lula"]').textContent, '0');
  mode.destroy();
});
