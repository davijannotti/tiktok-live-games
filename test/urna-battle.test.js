import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UrnaBattle, TEAMS, ROUND_MS, RESULT_MS } from '../public/games/urna-battle/engine.js';

const gift = (extra = {}) => ({ giftId: 5655, giftName: 'Rose', giftValue: 1, repeatCount: 1,
  user: { nickname: '<img src=x onerror=alert(1)>' }, ...extra });

test('first gift scores; known gifts map to explicit sides; unknown gifts do not score', () => {
  const game = new UrnaBattle(0);
  assert.equal(game.receiveGift(gift(), 0).points, 1);
  assert.equal(game.scores.lula, 1);
  game.receiveGift(gift({giftId: 99, giftName: 'White Rose', giftValue: 5}), 1);
  assert.equal(game.scores.bolsonaro, 5);
  assert.equal(game.receiveGift(gift({giftId: 99, giftName: 'Unknown'}), 2), null);
  assert.equal(game.receiveGift(gift({giftValue: -1}), 2), null);
  assert.equal(game.receiveGift(gift({repeatCount: Infinity}), 2), null);
});

test('counts final combo exactly once and rejects duplicate message IDs', () => {
  const game = new UrnaBattle(0);
  for (let count = 1; count <= 10; count++)
    assert.equal(game.receiveGift(gift({streakType: 1, repeatEnd: false, repeatCount: count}), 0), null);
  const final = gift({streakType: 1, repeatEnd: true, repeatCount: 10, eventId: 'unique'});
  assert.equal(game.receiveGift(final, 1).points, 10);
  assert.equal(game.receiveGift(final, 1), null);
  assert.equal(game.scores.lula, 10);
});

test('5-minute round freezes result for 1 minute, then clears scores and activity', () => {
  const game = new UrnaBattle(0);
  assert.equal(ROUND_MS, 5 * 60 * 1000);
  game.receiveGift(gift(), 0);
  assert.equal(game.tick(ROUND_MS - 1).phase, 'playing');
  assert.deepEqual(game.tick(ROUND_MS), {phase: 'result', remaining: RESULT_MS, winner: 'lula'});
  assert.equal(game.receiveGift(gift(), ROUND_MS), null);
  assert.equal(game.simulate('bolsonaro', 'Demo', ROUND_MS), null);
  assert.equal(game.tick(ROUND_MS + RESULT_MS).phase, 'playing');
  assert.equal(game.round, 2);
  assert.deepEqual(game.scores, {lula: 0, bolsonaro: 0});
  assert.equal(game.events.length, 0);
  assert.equal(game.seen.size, 0);
});

test('automatic players score and can choose the winner', () => {
  const game = new UrnaBattle(0);
  game.simulate('lula', 'Demo', 0);
  assert.equal(game.events[0].simulated, true);
  assert.equal(game.simulated.lula, 1);
  assert.equal(game.scores.lula, 1);
  assert.equal(game.tick(ROUND_MS).winner, 'lula');
  game.tick(ROUND_MS + RESULT_MS);
  assert.equal(game.simulated.lula, 0);
});

test('clock resumes correctly after multiple complete cycles without ticking', () => {
  const game = new UrnaBattle(0);
  game.receiveGift(gift(), 0);
  assert.equal(game.tick(3 * (ROUND_MS + RESULT_MS) + 1000).remaining, ROUND_MS - 1000);
  assert.equal(game.round, 4);
  assert.equal(game.scores.lula, 0);
});

test('automatic pressure alternates, stays roughly balanced, and freezes at results', () => {
  const game = new UrnaBattle(0);
  let seed = 42;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const leaders = new Set();
  const pressures = new Set();
  let lula = 0, total = 0;
  // Slower rounds contain few plays; check balance across many rounds.
  for (let round = 0; round < 100; round++) {
    game.reset(0);
    for (let now = 45000; now < ROUND_MS; now += 250) {
      game.automatic('Player', now, random);
      pressures.add(game.pressureTeam);
      if (game.simulated.lula !== game.simulated.bolsonaro)
        leaders.add(game.simulated.lula > game.simulated.bolsonaro ? 'lula' : 'bolsonaro');
    }
    lula += game.simulated.lula;
    total += game.simulated.lula + game.simulated.bolsonaro;
  }
  assert.ok(lula / total > .4 && lula / total < .6);
  assert.equal(pressures.size, 2);
  assert.equal(leaders.size, 2);
  assert.equal(game.automatic('Player', ROUND_MS, random), null);
});

test('first accepted real gift stops automatic plays for the whole round; new round re-enables them', () => {
  const game = new UrnaBattle(0);
  assert.ok(game.automatic('Player', 45000, () => .5));
  game.receiveGift(gift(), 46000);
  assert.equal(game.realGiftReceived, true);
  for (const now of [45000, 90000, ROUND_MS - 1])
    assert.equal(game.automatic('Player', now, () => .5), null);
  const restart = ROUND_MS + RESULT_MS;
  game.tick(restart);
  assert.equal(game.realGiftReceived, false);
  assert.ok(game.automatic('Player', restart + 45000, () => .5));
});

test('unknown, invalid and unfinished real gifts do not stop automatic plays', () => {
  const game = new UrnaBattle(0);
  for (const data of [gift({giftId:99,giftName:'Unknown'}), gift({giftValue:0}),
    gift({streakType:1,repeatEnd:false})]) assert.equal(game.receiveGift(data, 0), null);
  assert.equal(game.realGiftReceived, false);
  assert.ok(game.automatic('Player', 45000, () => .5));
});

test('automatic plays start after 5 seconds, vary from 5 to 30 seconds, and never catch up in bursts', () => {
  const game = new UrnaBattle(0);
  assert.equal(game.automatic('Player', 4999), null);
  assert.equal(game.automatic('Player', 5000, () => 0).points, 1);
  assert.equal(game.nextAutomatic, 10000);
  assert.equal(game.automatic('Player', 9999), null);
  assert.equal(game.automatic('Player', 10000, () => .999).points, 1);
  assert.ok(game.nextAutomatic > 39900 && game.nextAutomatic < 40000);
  assert.equal(game.automatic('Player', 39900), null);
  assert.equal(game.automatic('Player', 100000, () => .5).points, 1);
  assert.equal(game.nextAutomatic, 117500);
  assert.equal(game.automatic('Player', 100000), null);
  const restart = ROUND_MS + RESULT_MS;
  game.tick(restart);
  assert.equal(game.automatic('Player', restart + 4999), null);
  assert.ok(game.automatic('Player', restart + 5000, () => .5));
});

test('each team accepts its 1-coin and 10-coin gifts and equal value scores equally', () => {
  const game = new UrnaBattle(0);
  for (const [giftName, team, giftValue] of [
    ['Rose', 'lula', 1], ['Heart', 'lula', 10],
    ['White Rose', 'bolsonaro', 1], ['Tiny Diny', 'bolsonaro', 10],
  ]) {
    const event = game.receiveGift(gift({giftId:99, giftName, giftValue}), 0);
    assert.equal(event.team, team);
    assert.equal(event.points, giftValue);
  }
  assert.deepEqual(game.scores, {lula:11, bolsonaro:11});
  const roses = game.receiveGift(gift({repeatCount:10}), 1);
  const dinosaur = game.receiveGift(gift({giftId:99, giftName:'Tiny Diny', giftValue:10}), 1);
  assert.equal(roses.points, dinosaur.points);
  for (const giftName of ['GG', 'TikTok', 'Perfume', 'Rosa'])
    assert.equal(game.receiveGift(gift({giftId:99, giftName}), 1), null);
  // Use the live's value, including regional or future price changes.
  assert.equal(game.receiveGift(gift({giftId:99, giftName:'Heart', giftValue:5}), 1).points, 5);
});

test('the green team displays Flávio Bolsonaro throughout the game', () => {
  assert.equal(TEAMS.bolsonaro.name, 'Flávio Bolsonaro');
});

test('chat votes accept embedded numbers once per stable user across both teams and reset each round', () => {
  const game = new UrnaBattle(0);
  const chat = (comment, uniqueId = 'ana') => ({comment, user:{uniqueId, nickname:'Ana'}});
  for (const comment of ['13 22', 'Lula', '', 13]) assert.equal(game.receiveChat(chat(comment), 0), null);
  assert.equal(game.receiveChat(chat('13', ''), 0), null);
  assert.equal(game.receiveChat(chat('vai 13.13!!'), 0).points, 1);
  assert.equal(game.receiveChat(chat('22', 'ANA'), 1), null);
  assert.equal(game.receiveChat(chat('22', 'bia'), 1).team, 'bolsonaro');
  assert.deepEqual(game.scores, {lula:1, bolsonaro:1});
  assert.equal(game.realGiftReceived, false);
  assert.ok(game.automatic('Player', 5000, () => .5));
  assert.equal(game.receiveGift(gift(), 6000).points, 1);
  assert.equal(game.receiveChat(chat('13', 'nova'), ROUND_MS), null);
  assert.equal(game.receiveChat(chat('22'), ROUND_MS + RESULT_MS).team, 'bolsonaro');
  assert.equal(game.chatVoters.size, 1);
});

test('round leaderboards count all comments, final gift value and individual like increments, excluding bots', () => {
  const game = new UrnaBattle(0);
  const ana = {uniqueId:'ana', nickname:'Ana'}, bia = {uniqueId:'bia', nickname:'Bia'};
  game.receiveChat({comment:'13.13', user:ana}, 0);
  game.receiveChat({comment:'bom dia', user:ana}, 1);
  game.receiveChat({comment:'22!', user:bia}, 2);
  assert.equal(game.receiveChat({comment:'13 e 22', user:bia}, 3), null);
  assert.equal(game.receiveChat({comment:'113', user:{uniqueId:'caio'}}, 4).team, 'lula');
  const data = gift({user:bia, giftValue:10, repeatCount:2, eventId:'combo', streakType:1, repeatEnd:false});
  game.receiveGift(data, 5);
  game.receiveGift({...data, repeatEnd:true}, 6);
  game.receiveGift({...data, repeatEnd:true}, 7);
  game.receiveGift(gift({giftId:99, giftName:'Other', user:ana, giftValue:5}), 8);
  game.receiveLike({user:ana, likeCount:3, totalLikeCount:1000}, 9);
  game.receiveLike({user:ana, likeCount:2, totalLikeCount:1002}, 10);
  game.receiveLike({user:bia, likeCount:4}, 11);
  for (const likeCount of [0, -1, Infinity, 1.5]) game.receiveLike({user:bia, likeCount}, 12);
  game.simulate('lula', 'Bot', 13);
  assert.equal(game.leaderboard('comments')[0].comments, 2);
  assert.equal(game.leaderboard('gifts')[0].id, 'bia');
  assert.equal(game.leaderboard('gifts')[0].gifts, 20);
  assert.equal(game.leaderboard('likes')[0].likes, 5);
  assert.equal(game.supporters.has('Bot'), false);
  game.receiveLike({user:bia, likeCount:100}, ROUND_MS);
  game.receiveChat({user:bia, comment:'oi'}, ROUND_MS);
  assert.equal(game.leaderboard('likes')[0].id, 'ana');
  assert.equal(game.leaderboard('comments').find(p => p.id === 'bia').comments, 2);
  game.tick(ROUND_MS + RESULT_MS);
  assert.deepEqual(game.leaderboard('comments'), []);
  assert.deepEqual(game.leaderboard('gifts'), []);
  assert.deepEqual(game.leaderboard('likes'), []);
});
