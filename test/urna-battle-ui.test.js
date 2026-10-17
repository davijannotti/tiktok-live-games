import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { modeForRound } from '../public/games/urna-battle/modes.js';
import { UrnaBattle, TEAMS, ROUND_MS, RESULT_MS } from '../public/games/urna-battle/engine.js';

const html = readFileSync(new URL('../public/games/urna-battle/index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../public/games/urna-battle/game.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
function screen(reducedMotion, search = '', fetchRanking = undefined) {
  const modeCalls = [];
  const fakeMode = id => () => {
    modeCalls.push([id, 'create']);
    return {render: state => modeCalls.push([id, 'render', {...state, scores:{...state.scores}}]),
      onScore: event => modeCalls.push([id, 'score', event]), destroy: () => modeCalls.push([id, 'destroy'])};
  };
  const all = [], ids = new Map(), handlers = {}, timers = [], sounds = [];
  let now = 0, update;
  function element() {
    const classes = new Set();
    const el = { hidden: false, textContent: '', children: [], style: { setProperty(k, v) { this[k] = v; } },
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
        toggle(c, on) { if (on) classes.add(c); else classes.delete(c); } },
      append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(e => e !== this); },
      animate() { const animation = {}; this.animation = animation; return animation; },
      offsetLeft: 0, offsetTop: 0, offsetWidth: 20,
    };
    all.push(el);
    return el;
  }
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) ids.set(id, element());
  ids.get('result').hidden = ids.get('reward-popup').hidden = ids.get('donor-banner').hidden = true;
  const meter = element();
  const keys = new Map([...new Set('1234567890'.split('').concat('ok'))].map(k => [k, element()]));
  runInNewContext(source, { UrnaBattle: class extends UrnaBattle {
      constructor() { super(0); }
      tick(time = now) { return super.tick(time); }
      receiveGift(data, time = now) { return super.receiveGift(data, time); }
      receiveLike(data, time = now) { return super.receiveLike(data, time); }
      receiveChat(data, time = now) { return super.receiveChat(data, time); }
      automatic(nickname, time = now) { return super.automatic(nickname, time, () => .25); }
    }, TEAMS, ROUND_MS, RESULT_MS,
    modeForRound, createRaceMode:fakeMode('race'), createTugMode:fakeMode('tug'), createTowerMode:fakeMode('tower'),
    GameAudio: class { play(cue) { sounds.push(cue); } clearEffects() { sounds.push('clear'); } },
    Date: class extends Date { static now() { return now; } },
    document: { getElementById: id => { assert.ok(ids.has(id), `Missing UI id: ${id}`); return ids.get(id); },
      createElement: element, querySelector: selector => selector === '.battle-meter' ? meter : keys.get(selector.match(/data-key="([^"]+)"/)[1]),
      querySelectorAll: selector => all.filter(el => el.classList.contains(selector.slice(1))),
    }, matchMedia: () => ({ matches: reducedMotion }),
    TikTokBridge: { on: (event, callback) => { handlers[event] = callback; } },
    addEventListener() {}, innerWidth: 540, innerHeight: 960,
    fetch: fetchRanking,
    location: { search }, URLSearchParams, Intl, console,
    Math: Object.assign(Object.create(Math), { random: () => .25 }),
    setInterval: callback => { update = callback; }, setTimeout: callback => { timers.push(callback); },
  });
  return { ids, timers, sounds, modeCalls, chat: data => handlers.chat(data), like: data => handlers.like(data), update: time => { now = time; update(); },
    gift: extra => handlers.gift({ giftId: 5655, giftName: 'Rose', giftValue: 1, repeatCount: 1,
      user: { nickname: 'Torcida' }, ...extra }),
    async finish() { while (timers.length) { timers.shift()(); for (let i = 0; i < 5; i++) await Promise.resolve(); } },
  };
}

test('UI announces lead changes, clears automatic animation on first gift, celebrates and resets rounds', async () => {
  const ui = screen(false);
  ui.update(45000);
  ui.gift({ giftValue: 10, eventId: 'lula' });
  await ui.finish();
  assert.match(ui.ids.get('battle-status').textContent, /LULA NA FRENTE/);
  ui.gift({ giftId: 99, giftName: 'White Rose', giftValue: 20, eventId: 'flavio' });
  assert.match(ui.ids.get('battle-status').textContent, /VIROU! FLÁVIO/);
  assert.ok(ui.sounds.includes('comeback'));
  await ui.finish();
  assert.equal(ui.ids.get('score-bolsonaro').textContent, '20');
  assert.ok(ui.sounds.includes('big'));
  assert.ok(ui.sounds.includes('key'));
  assert.ok(ui.ids.get('effects').children.length > 0);
  for (const particle of [...ui.ids.get('effects').children]) particle.animation.onfinish();
  assert.equal(ui.ids.get('effects').children.length, 0);
  ui.update(ROUND_MS - 1000);
  assert.ok(ui.ids.get('stage').classList.contains('urgent'));
  const ticks = ui.sounds.filter(cue => cue === 'countdown').length;
  ui.update(ROUND_MS - 1000);
  assert.equal(ui.sounds.filter(cue => cue === 'countdown').length, ticks);
  ui.update(ROUND_MS);
  assert.equal(ui.ids.get('result').hidden, false);
  assert.equal(ui.ids.get('winner').textContent, 'FLÁVIO BOLSONARO');
  assert.equal(ui.sounds.at(-1), 'win');
  ui.update(ROUND_MS + RESULT_MS);
  assert.equal(ui.ids.get('result').hidden, true);
  assert.equal(ui.ids.get('reward-popup').hidden, true);
  assert.equal(ui.ids.get('score-lula').textContent, '0');
  assert.equal(ui.ids.get('score-bolsonaro').textContent, '0');
  assert.ok(ui.sounds.includes('start'));
  ui.update(ROUND_MS + RESULT_MS + 45000);
  assert.equal(Number(ui.ids.get('score-lula').textContent) + Number(ui.ids.get('score-bolsonaro').textContent), 1);
});

test('reduced-motion mode keeps scoring and confirmation but skips animated particles', async () => {
  const ui = screen(true);
  ui.gift({ eventId: 'one' });
  await ui.finish();
  assert.equal(ui.ids.get('score-lula').textContent, '1');
  assert.match(ui.ids.get('screen-state').textContent, /CONFIRMOU/);
  assert.equal(ui.ids.get('effects').children.length, 0);
  assert.equal(ui.ids.get('reward-popup').hidden, true);
  ui.update(90000);
  assert.equal(ui.ids.get('score-lula').textContent, '1');
  assert.equal(ui.ids.get('score-bolsonaro').textContent, '0');
});

test('real donors appear immediately during queued animations and remain in four history rows', async () => {
  const ui = screen(false);
  for (let i = 0; i < 5; i++) {
    const nickname = i === 4 ? '<img src=x onerror=alert(1)>' : `Pessoa ${i}`;
    ui.gift({eventId: `gift-${i}`, user: {nickname}});
    assert.equal(ui.ids.get('donor-banner').hidden, false);
    assert.equal(ui.ids.get('donor-name').textContent, nickname);
  }
  const rows = ui.ids.get('feed').children;
  assert.equal(rows.length, 4);
  assert.equal(rows[0].children[1].textContent, '<img src=x onerror=alert(1)> · Rose ×1');
  assert.equal(rows[3].children[1].textContent, 'Pessoa 1 · Rose ×1');
  ui.timers.shift()();
  assert.equal(ui.ids.get('donor-banner').hidden, false);
  await ui.finish();
  assert.equal(ui.ids.get('donor-banner').hidden, true);
  assert.equal(ui.ids.get('feed').children.length, 4);
});

test('automatic plays use varied nickname-style names and identify themselves as game activity', () => {
  const names = source.match(/const simulatedNames = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g);
  assert.ok(names.length >= 20);
  assert.equal(new Set(names).size, names.length);
  const ui = screen(false);
  ui.update(45000);
  const row = ui.ids.get('feed').children[0];
  assert.equal(row.children[0].textContent, 'JOGO');
  assert.ok(names.some(name => row.children[1].textContent.startsWith(name.slice(1, -1) + ' · ')));
  assert.equal(ui.ids.get('donor-banner').hidden, true);
});

test('ambient reactions rotate every 7–10 seconds without scoring or sound and yield to gifts/results', async () => {
  const ui = screen(false, '?demo=0');
  ui.update(6999);
  assert.equal(ui.ids.get('fighter-lula').animation, undefined);
  const soundCount = ui.sounds.length;
  ui.update(7000);
  assert.match(ui.ids.get('battle-status').textContent, /LULA: COMPANHEIROS/);
  assert.ok(ui.ids.get('fighter-lula').animation);
  ui.update(14749);
  assert.match(ui.ids.get('battle-status').textContent, /LULA: COMPANHEIROS/);
  ui.update(14750);
  assert.match(ui.ids.get('battle-status').textContent, /FLÁVIO: MEUS AMIGOS/);
  ui.update(22500);
  assert.ok(ui.ids.get('gift-lula').animation);
  assert.equal(ui.ids.get('score-lula').textContent, '0');
  assert.equal(ui.ids.get('score-bolsonaro').textContent, '0');
  assert.equal(ui.sounds.length, soundCount);
  ui.gift({eventId:'priority'});
  ui.update(30000);
  assert.match(ui.ids.get('battle-status').textContent, /LULA NA FRENTE/);
  await ui.finish();
  assert.ok(ui.ids.get('effects').children.some(el => el.className === 'gift-flight'));
  ui.update(ROUND_MS);
  assert.equal(ui.ids.get('effects').children.some(el => el.className === 'gift-flight'), false);
  const resultStatus = ui.ids.get('battle-status').textContent;
  ui.update(ROUND_MS + 10000);
  assert.equal(ui.ids.get('battle-status').textContent, resultStatus);
});

test('reduced motion keeps rotating torcida messages without ambient movement', () => {
  const ui = screen(true, '?demo=0');
  ui.update(7000);
  assert.match(ui.ids.get('battle-status').textContent, /LULA: COMPANHEIROS/);
  assert.equal(ui.ids.get('fighter-lula').animation, undefined);
  assert.equal(ui.ids.get('battle-status').animation, undefined);
});

test('parody debate alternates paired replies without repeating the first exchange', () => {
  const ui = screen(true, '?demo=0');
  const lines = [];
  for (let i = 1; i <= 8; i++) {
    ui.update(7000 + (i - 1) * 7750);
    lines.push(ui.ids.get('battle-status').textContent);
  }
  assert.equal(new Set(lines).size, 8);
  lines.forEach((line, i) => assert.match(line, i % 2 ? /^FLÁVIO:/ : /^LULA:/));
  assert.match(lines[2], /TANTA ROSA/);
  assert.match(lines[3], /DINO CHEGANDO/);
  assert.equal(ui.ids.get('score-lula').textContent, '0');
  assert.equal(ui.ids.get('score-bolsonaro').textContent, '0');
});

test('free chat votes show the donor and history without gift animations or duplicate votes', async () => {
  const ui = screen(false, '?demo=0');
  const user = {uniqueId:'ana', nickname:'Ana do chat'};
  ui.chat({comment:'13', user});
  assert.equal(ui.ids.get('score-lula').textContent, '1');
  assert.equal(ui.ids.get('donor-name').textContent, user.nickname);
  assert.match(ui.ids.get('donor-detail').textContent, /Comentário 13/);
  assert.equal(ui.ids.get('feed').children[0].children[0].textContent, 'CHAT');
  ui.chat({comment:'22', user});
  assert.equal(ui.ids.get('score-bolsonaro').textContent, '0');
  await ui.finish();
  assert.equal(ui.ids.get('effects').children.some(el => el.className === 'gift-flight'), false);
  ui.update(ROUND_MS + RESULT_MS);
  ui.chat({comment:'22', user});
  assert.equal(ui.ids.get('score-bolsonaro').textContent, '1');
});

test('result renders separate real-user leaderboards safely and clears them next round', async () => {
  const ui = screen(true, '?demo=0');
  const user = {uniqueId:'ana', nickname:'<img src=x onerror=alert(1)>'};
  ui.chat({comment:'13.13', user});
  ui.chat({comment:'bom dia', user});
  ui.like({user, likeCount:8});
  ui.gift({user, eventId:'ranking', giftValue:10});
  await ui.finish();
  ui.update(ROUND_MS);
  assert.equal(ui.ids.get('leaders-comments').children[0].children[1].textContent, '1. ' + user.nickname);
  assert.equal(ui.ids.get('leaders-comments').children[0].children[2].textContent, '2 coment.');
  assert.equal(ui.ids.get('leaders-gifts').children[0].children[2].textContent, '10 moedas');
  assert.equal(ui.ids.get('leaders-likes').children[0].children[2].textContent, '8 curtidas');
  ui.update(ROUND_MS + RESULT_MS);
  ui.update(2 * ROUND_MS + RESULT_MS);
  assert.match(ui.ids.get('leaders-comments').children[0].textContent, /Ninguém ainda/);
});

test('winner photo and party match the winning side and avatar URLs are safe', async () => {
  const ui = screen(true, '?demo=0');
  ui.chat({comment:'22', user:{uniqueId:'bia',nickname:'Bia',profilePictureUrl:'https://example.com/bia.png'}});
  assert.equal(ui.ids.get('donor-avatar').children[0].children[0].src, 'https://example.com/bia.png');
  await ui.finish();
  ui.update(ROUND_MS);
  assert.equal(ui.ids.get('winner-hero').hidden, false);
  assert.equal(ui.ids.get('winner-photo').className, 'portrait winner-photo flavio');
  assert.equal(ui.ids.get('winner-party').src, 'assets/pl.svg');
  assert.equal(ui.ids.get('result').classList.contains('winner-green'), true);
  ui.update(ROUND_MS + RESULT_MS);
  ui.chat({comment:'13',user:{uniqueId:'ana',nickname:'Ana',profilePictureUrl:'javascript:alert(1)'}});
  assert.equal(ui.ids.get('donor-avatar').children[0].children.length, 0);
  await ui.finish();
  ui.update(2 * ROUND_MS + RESULT_MS);
  assert.equal(ui.ids.get('winner-party').src, 'assets/pt.svg');
  assert.equal(ui.ids.get('result').classList.contains('winner-red'), true);
});

test('results alternate between round and all-time rankings and handle missing avatars', async () => {
  const person = {id:'ana',nickname:'Ana histórica',profilePictureUrl:'https://example.com/ana.png',comments:20,gifts:100,likes:50};
  const ui = screen(true, '?demo=0&id=alice', async url => {
    assert.equal(url, '/api/leaderboards/alice');
    return {ok:true, json:async () => ({comments:[person],gifts:[person],likes:[person]})};
  });
  ui.update(ROUND_MS);
  await new Promise(resolve => setImmediate(resolve));
  ui.update(ROUND_MS + 10000);
  assert.equal(ui.ids.get('ranking-scope').textContent, 'DE TODOS OS TEMPOS');
  assert.equal(ui.ids.get('leaders-gifts').children[0].children[1].textContent, '1. Ana histórica');
  const avatar = ui.ids.get('leaders-gifts').children[0].children[0].children[0];
  avatar.onerror();
  assert.equal(avatar.hidden, true);
  ui.update(ROUND_MS + 20000);
  assert.equal(ui.ids.get('ranking-scope').textContent, 'DESTA RODADA');
  ui.update(ROUND_MS + RESULT_MS);
  ui.update(2 * ROUND_MS + RESULT_MS);
  assert.equal(ui.ids.get('winner-hero').hidden, true);
});

test('rounds rotate the games without reloading shared scoring, avatars or round results', async () => {
  const ui = screen(true, '?demo=0');
  assert.match(ui.ids.get('mode-name').textContent, /URNA/);
  const cycle = ROUND_MS + RESULT_MS;
  ui.update(cycle);
  assert.match(ui.ids.get('mode-name').textContent, /CORRIDA/);
  assert.equal(ui.ids.get('stage').classList.contains('minigame-active'), true);
  assert.equal(ui.ids.get('mode-announcement').hidden, false);
  ui.chat({comment:'13',user:{uniqueId:'ana',nickname:'Ana'}});
  assert.equal(ui.ids.get('score-lula').textContent, '1');
  assert.ok(ui.modeCalls.some(([id, kind, event]) => id === 'race' && kind === 'score' && event.team === 'lula'));
  await ui.finish();
  assert.equal(ui.ids.get('reward-title').textContent, 'VOTO NO CHAT!');
  ui.update(cycle + ROUND_MS);
  assert.match(ui.ids.get('next-game').textContent, /CABO DE GUERRA/);
  ui.update(2 * cycle);
  assert.ok(ui.modeCalls.some(([id,kind]) => id === 'race' && kind === 'destroy'));
  assert.match(ui.ids.get('mode-name').textContent, /CABO/);
  ui.update(3 * cycle);
  assert.match(ui.ids.get('mode-name').textContent, /TORRE/);
  ui.update(4 * cycle);
  assert.match(ui.ids.get('mode-name').textContent, /URNA/);
  assert.equal(ui.ids.get('minigame-host').hidden, true);
  assert.equal(ui.ids.get('stage').classList.contains('minigame-active'), false);
});

test('fixed mode previews reset their renderer and scores each round', () => {
  const ui = screen(true, '?demo=0&mode=tower&fixed=1');
  assert.match(ui.ids.get('mode-name').textContent, /TORRE/);
  ui.chat({comment:'22',user:{uniqueId:'bia',nickname:'Bia'}});
  ui.update(ROUND_MS + RESULT_MS);
  assert.equal(ui.ids.get('score-bolsonaro').textContent, '0');
  assert.equal(ui.modeCalls.filter(([id,kind]) => id === 'tower' && kind === 'create').length, 2);
  assert.ok(ui.modeCalls.some(([id,kind]) => id === 'tower' && kind === 'destroy'));
});
