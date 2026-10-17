import assert from 'node:assert/strict';
import {test} from 'node:test';
import {modeForRound} from '../public/games/urna-battle/modes.js';

test('four games rotate in order, wrap, support starting offsets and fixed previews', () => {
  assert.deepEqual([1,2,3,4,5].map(round => modeForRound(round).id), ['urna','race','tug','tower','urna']);
  assert.deepEqual([1,2,3,4].map(round => modeForRound(round,'tug').id), ['tug','tower','urna','race']);
  assert.equal(modeForRound(20,'race',true).id,'race');
  assert.equal(modeForRound(1,'unknown').id,'urna');
});
