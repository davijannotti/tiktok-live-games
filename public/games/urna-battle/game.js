import { UrnaBattle, TEAMS, ROUND_MS, RESULT_MS } from './engine.js';
import { GameAudio } from './audio.js';
import { modeForRound } from './modes.js';
import { createMode as createRaceMode } from '../planalto-race/mode.js';
import { createMode as createTugMode } from '../torcida-tug/mode.js';
import { createMode as createTowerMode } from '../torcida-tower/mode.js';

const game = new UrnaBattle();
const audio = new GameAudio();
const $ = id => document.getElementById(id);
const format = value => new Intl.NumberFormat('pt-BR', { notation: value >= 1000000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
const clock = ms => {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const queue = [];
let animating = false;
let animationVersion = 0;
let donorVersion = 0;
let lastRound = game.round;
let lastLeader = null;
let lastCountdown = null;
let nextHype = Date.now() + 7000;
let hypeStep = 0;
let allTimeLeaders = null;
let rankingScope = null;
// Fictional exchanges for the game, inspired by public speaking styles.
const debateLines = [
  ['COMPANHEIROS, OLHA ESSA TORCIDA!', 'MEUS AMIGOS, A NOSSA TAMBÉM VEIO!'],
  ['NUNCA ANTES SE VIU TANTA ROSA!', 'CALMA, LULA. TEM DINO CHEGANDO!'],
  ['DEIXA EU TE CONTAR UMA COISA...', 'PODE FALAR. TÔ DE OLHO NO PLACAR!'],
  ['MEU QUERIDO, AQUI TEM CORAÇÃO!', 'E AQUI TEM TORCIDA, MEU AMIGO!'],
  ['É ROSA PRA CÁ, PONTO PRA LÁ!', 'ROSA BRANCA TAMBÉM VALE, HEIN!'],
  ['ESSA TORCIDA NÃO DESISTE NUNCA!', 'A MINHA TAMBÉM NÃO ARREDA O PÉ!'],
  ['COMPANHEIRA, SEGURA ESSA VIRADA!', 'SEGURA AÍ! A DISPUTA NÃO ACABOU!'],
  ['VOU TE DIZER: ESSE TIME TEM RAÇA!', 'ENTÃO PREPARA QUE VEM RESPOSTA!'],
  ['Ô, FLÁVIO, TÁ VENDO ESSE CORAÇÃO?', 'TÔ VENDO! CADÊ MEU TINY DINY?'],
  ['MEU POVO, O PLACAR TÁ CHAMANDO!', 'PESSOAL, VAMOS FAZER BARULHO!'],
  ['AQUI É NA BASE DA CONVERSA!', 'CONVERSA BOA É COM PLACAR JUNTO!'],
  ['NINGUÉM GANHA ANTES DO APITO!', 'NESSA EU CONCORDO. ATÉ O FIM!'],
  ['COMPANHEIROS, AINDA TEM JOGO!', 'MEUS AMIGOS, VAMOS PRA CIMA!'],
  ['QUERO VER ESSA TORCIDA SORRINDO!', 'O SORRISO VEM COM A VIRADA!'],
  ['Ô, MEU QUERIDO, OLHA A URNA!', 'TÔ OLHANDO. ELA NÃO PARA, HEIN!'],
  ['O CORAÇÃO DA TORCIDA É GRANDE!', 'E O NOSSO DINO É PEQUENO E BRABO!'],
];
const simulatedNames = [
  'BiaDoPix', 'ZeDaResenha', 'Mari_S2', 'Juninho77', 'DonaCida', 'GuiNaArea',
  'AnaFlor', 'PedrinhoBR', 'Luuh_23', 'RafaDoCafe', 'TatiOnline', 'Nando013',
  'JuDeBoa', 'CaioZin', 'PriSorriso', 'ViniDaLive', 'NinaSol', 'LeoDaPraia',
  'Duda_021', 'BrunaoTop', 'Carolzinha', 'ThiDoFut', 'LariMoon', 'PaulinhoSP',
  'Malu_07', 'DaniDaBahia', 'KakaMineiro', 'IsaEstrela', 'BetoDaZoeira', 'SolDoNorte',
];
const params = new URLSearchParams(location.search);
const demosEnabled = params.get('demo') !== '0';

const modeFactories = {race:createRaceMode, tug:createTugMode, tower:createTowerMode};
const startingMode = params.get('mode') || 'urna';
const fixedMode = params.get('fixed') === '1';
let currentMode = null;
let modeRenderer = null;
let modeAnnouncementUntil = 0;
const selectedMode = round => modeForRound(round, startingMode, fixedMode);

function setMode(round, now = Date.now()) {
  const selected = selectedMode(round);
  const switching = currentMode && currentMode.id !== selected.id;
  modeRenderer?.destroy();
  $('minigame-host').replaceChildren();
  currentMode = selected;
  $('stage').ariaLabel = `${selected.name}: jogo fictício Lula versus Flávio Bolsonaro`;
  $('stage').classList.toggle('minigame-active', selected.id !== 'urna');
  $('minigame-host').hidden = selected.id === 'urna';
  modeRenderer = modeFactories[selected.id]?.($('minigame-host'), {reducedMotion}) || null;
  $('mode-name').textContent = `${selected.icon} ${selected.name.toUpperCase()}`;
  $('mode-hint').textContent = selected.hint;
  if (switching) {
    modeAnnouncementUntil = now + 3500;
    $('mode-announcement-title').textContent = `AGORA É ${selected.name.toUpperCase()}!`;
    $('mode-announcement-hint').textContent = `${selected.hint} Sua torcida continua!`;
  }
}

function renderMode(now = Date.now()) {
  const state = game.tick(now);
  modeRenderer?.render({...state, scores:game.scores, duration:ROUND_MS,
    elapsed:Math.min(ROUND_MS, Math.max(0, now - game.startedAt))});
}

function resize() {
  const scale = Math.min(innerWidth / 540, innerHeight / 960);
  $('stage').style.transform = `translate(-50%, -50%) scale(${scale})`;
}
addEventListener('resize', resize);
resize();

function profileAvatar(person) {
  const avatar = document.createElement('span');
  avatar.className = 'profile-avatar';
  avatar.textContent = '👤';
  if (typeof person.profilePictureUrl === 'string' && /^https?:\/\//i.test(person.profilePictureUrl)) {
    const image = document.createElement('img');
    image.src = person.profilePictureUrl;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => { image.hidden = true; };
    avatar.append(image);
  }
  return avatar;
}

function renderScores() {
  renderMode();
  $('battle-status').classList.remove('hype-message');
  for (const team of Object.keys(TEAMS)) {
    $(`score-${team}`).textContent = format(game.scores[team]);
  }
  const total = game.scores.lula + game.scores.bolsonaro;
  const balance = total ? game.scores.lula / total * 100 : 50;
  $('balance').style.width = `${balance}%`;
  document.querySelector('.battle-meter').style.setProperty('--balance', `${balance}%`);
  const leader = game.tick().winner;
  const comeback = lastLeader && leader && leader !== lastLeader;
  $('battle-status').textContent = leader
    ? `${comeback ? 'VIROU! ' : ''}${(TEAMS[leader].shortName || TEAMS[leader].name).toUpperCase()} NA FRENTE!`
    : total ? 'TÁ EMPATADO! QUEM DESEMPATA?' : 'QUEM VAI SAIR NA FRENTE?';
  if (comeback) audio.play('comeback');
  if (leader) lastLeader = leader;
  $('feed').replaceChildren();
  for (const event of game.events) {
    const item = document.createElement('li');
    item.className = event.simulated ? 'simulated' : 'real';
    const badge = document.createElement('small');
    badge.textContent = event.simulated ? 'JOGO' : event.kind === 'chat' ? 'CHAT' : 'REAL';
    const text = document.createElement('span');
    text.textContent = `${event.nickname} · ${event.gift} ×${event.count}`;
    const points = document.createElement('b');
    points.textContent = `+${format(event.points)} → ${TEAMS[event.team].number}`;
    points.style.color = event.team === 'lula' ? 'var(--red)' : 'var(--green)';
    item.append(badge);
    item.append(text, points);
    if (!event.simulated) item.append(profileAvatar(event));
    $('feed').append(item);
  }
  if (!game.events.length) {
    const item = document.createElement('li');
    item.textContent = 'Comente 13 ou 22 e entre na disputa!';
    $('feed').append(item);
  }
}

function ambientHype(now, remaining) {
  if (now < nextHype) return;
  nextHype = now + 7000 + Math.random() * 3000;
  if (animating || !$('donor-banner').hidden || !$('result').hidden || remaining <= 5000) return;
  const team = hypeStep % 2 === 0 ? 'lula' : 'bolsonaro';
  const mode = Math.floor(hypeStep++ / 2) % 3;
  const name = (TEAMS[team].shortName || TEAMS[team].name).toUpperCase();
  const exchange = debateLines[Math.floor((hypeStep - 1) / 2) % debateLines.length];
  const score = game.scores[team];
  const target = (Math.floor(score / 50) + 1) * 50;
  $('battle-status').classList.add('hype-message');
  $('battle-status').textContent = remaining <= 30000 ? `RETA FINAL! VAMOS, ${name}!`
    : mode === 2 && score > 0 ? `${name}: FALTAM ${format(target - score)} PRA ${format(target)}!`
    : `${name}: ${exchange[team === 'lula' ? 0 : 1]}`;
  if (reducedMotion) return;
  const targetElement = mode === 0 ? (currentMode.id === 'urna' ? $(`fighter-${team}`) : $('minigame-host'))
    : mode === 1 ? $(`gift-${team}`) : $('brazil-flag');
  targetElement.animate([
    { transform: 'translateY(0) rotate(0)' },
    { transform: 'translateY(-5px) rotate(-2deg)', offset: .3 },
    { transform: 'translateY(0) rotate(2deg)', offset: .65 },
    { transform: 'translateY(0) rotate(0)' },
  ], {duration: 850, easing: 'ease-in-out'});
  $('battle-status').animate([{opacity: .3}, {opacity: 1}], {duration: 300});
}

function flyingGift(event) {
  if (reducedMotion || event.simulated || event.kind === 'chat') return;
  const gift = document.createElement('span');
  gift.className = 'gift-flight';
  gift.style.left = event.team === 'lula' ? '25%' : '75%';
  const asset = {'white rose': 'white-rose', 'tiny diny': 'tiny-diny'}[event.gift.toLowerCase().trim()];
  if (asset) {
    const icon = document.createElement('img');
    icon.src = `assets/gifts/${asset}.png`;
    icon.alt = '';
    gift.append(icon);
  } else gift.textContent = event.team === 'lula' && event.gift.toLowerCase() === 'heart' ? '❤️' : '🌹';
  $('effects').append(gift);
  const animation = gift.animate([
    {transform: 'translate(-50%, 0) scale(.6)', opacity: 0},
    {transform: 'translate(-50%, -60px) scale(1.25)', opacity: 1, offset: .3},
    {transform: 'translate(-50%, -280px) scale(.5) rotate(15deg)', opacity: 0},
  ], {duration: 1000, easing: 'ease-out'});
  animation.onfinish = () => gift.remove();
}

function clearAnimation() {
  nextHype = Date.now() + 7000;
  donorVersion++;
  $('donor-banner').hidden = true;
  $('battle-status').classList.remove('hype-message');
  audio.clearEffects();
  animationVersion++;
  queue.length = 0;
  animating = false;
  document.querySelectorAll('.pressed').forEach(key => key.classList.remove('pressed'));
  $('pointer').style.opacity = '0';
  $('reward-popup').hidden = true;
  $('effects').replaceChildren();
  document.querySelectorAll('.cheering').forEach(el => el.classList.remove('cheering'));
  $('machine').classList.remove('vote');
  $('digit-1').textContent = '–';
  $('digit-2').textContent = '–';
  $('screen-person').textContent = 'PRESENTE VIROU PONTO!';
  $('screen-state').textContent = 'A torcida faz o jogo!';
  $('vote-label').textContent = 'QUEM VAI APERTAR O CONFIRMA?';
  $('vote-points').textContent = '13 × 22';
}

function confetti(team, count = 14) {
  if (reducedMotion) return;
  const colors = ['var(--yellow)', 'var(--ink)', team === 'lula' ? 'var(--red)' : 'var(--green)'];
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('span');
    particle.className = 'confetti';
    particle.style.background = colors[i % colors.length];
    particle.style.left = `${team === 'lula' ? 25 : team === 'bolsonaro' ? 75 : 50}%`;
    particle.style.top = '32%';
    $('effects').append(particle);
    const spread = (Math.random() - .5) * 360;
    const animation = particle.animate([
      { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
      { transform: `translate(${spread}px, -90px) rotate(${spread}deg)`, opacity: 1, offset: .35 },
      { transform: `translate(${spread * 1.3}px, 250px) rotate(${spread * 3}deg)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 400, easing: 'ease-out', fill: 'forwards' });
    animation.onfinish = () => particle.remove();
  }
}

function celebrate(event) {
  audio.play(event.points >= 10 ? 'big' : 'point');
  const fighter = $(`fighter-${event.team}`);
  fighter.classList.add('cheering');
  $('reward-title').textContent = event.kind === 'chat' ? 'VOTO NO CHAT!' : event.points >= 10 ? 'PRESENTÃO! AÍ SIM!' : 'BOA, TORCIDA!';
  $('reward-points').textContent = `+${format(event.points)}`;
  $('reward-player').textContent = event.nickname;
  $('reward-popup').hidden = false;
  if (!reducedMotion) {
    $('reward-popup').animate([
      { scale: .5, opacity: 0 }, { scale: 1.12, opacity: 1, offset: .35 }, { scale: 1, opacity: 1 },
    ], { duration: 400, easing: 'ease-out' });
    $(`score-${event.team}`).animate([
      { transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: .4 }, { transform: 'scale(1)' },
    ], { duration: 450 });
  }
  confetti(event.team);
  flyingGift(event);
}

async function animateNext() {
  if (animating || !queue.length) return;
  animating = true;
  const event = queue.shift();
  const version = animationVersion;
  const team = TEAMS[event.team];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (currentMode.id !== 'urna') {
    celebrate(event);
    await wait(reducedMotion ? 800 : 1200);
    if (version !== animationVersion) return;
    $(`fighter-${event.team}`).classList.remove('cheering');
    $('reward-popup').hidden = true;
    animating = false;
    animateNext();
    return;
  }
  $('vote-label').textContent = event.simulated ? `JOGADA · ${event.nickname}` : `${event.kind === 'chat' ? 'VOTO NO CHAT' : 'PRESENTE REAL'} · ${event.nickname}`;
  $('vote-points').textContent = `+${format(event.points)} → ${team.number}`;
  $('screen-person').textContent = team.name.toUpperCase();
  $('digit-1').textContent = '–';
  $('digit-2').textContent = '–';
  $('screen-state').textContent = event.simulated ? 'JOGADA • pontos registrados' : event.kind === 'chat' ? 'CHAT • voto registrado' : 'PRESENTE REAL • pontos registrados';
  for (const [index, keyName] of [...team.number, 'ok'].entries()) {
    if (version !== animationVersion) return;
    const key = document.querySelector(`[data-key="${keyName}"]`);
    if (!reducedMotion) {
      $('pointer').style.left = `${key.offsetLeft + key.offsetWidth / 2 - 6}px`;
      $('pointer').style.top = `${key.offsetTop + 3}px`;
      $('pointer').style.opacity = '1';
      key.classList.add('pressed');
    }
    if (index < 2) {
      $(`digit-${index + 1}`).textContent = keyName;
      audio.play('key');
    }
    else {
      $('screen-state').textContent = 'CONFIRMOU! PONTO PRA TORCIDA!';
      celebrate(event);
    }
    await wait(reducedMotion ? 0 : 340);
    if (version !== animationVersion) return;
    key.classList.remove('pressed');
  }
  $('pointer').style.opacity = '0';
  $('machine').classList.add('vote');
  await wait(reducedMotion ? 800 : 1000);
  if (version !== animationVersion) return;
  $('machine').classList.remove('vote');
  $(`fighter-${event.team}`).classList.remove('cheering');
  $('reward-popup').hidden = true;
  animating = false;
  animateNext();
}

function showEvent(event) {
  if (!event) return;
  modeAnnouncementUntil = 0;
  modeRenderer?.onScore(event);
  nextHype = Date.now() + 7000;
  renderScores();
  if (!event.simulated) {
    const version = ++donorVersion;
    $('donor-avatar').replaceChildren(profileAvatar(event));
    $('donor-name').textContent = event.nickname;
    $('donor-detail').textContent = `${event.gift} ×${event.count} · +${format(event.points)} PRO ${(TEAMS[event.team].shortName || TEAMS[event.team].name).toUpperCase()}!`;
    $('donor-banner').hidden = false;
    setTimeout(() => { if (version === donorVersion) $('donor-banner').hidden = true; }, 5000);
  }
  // Bound visual backlog; scores are recorded immediately, even if animations are skipped.
  if (queue.length < 6) queue.push(event);
  animateNext();
}

TikTokBridge.on('like', data => {
  update();
  game.receiveLike(data);
});

function renderLeaderboards(allTime = false) {
  $('ranking-scope').textContent = allTime ? 'DE TODOS OS TEMPOS' : 'DESTA RODADA';
  for (const [metric, unit] of [['comments', 'coment.'], ['gifts', 'moedas'], ['likes', 'curtidas']]) {
    const list = $(`leaders-${metric}`);
    list.replaceChildren();
    for (const [index, person] of (allTime ? allTimeLeaders[metric] : game.leaderboard(metric)).entries()) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${index + 1}. ${person.nickname}`;
      const value = document.createElement('b');
      value.textContent = `${format(person[metric])} ${person[metric] === 1 && metric !== 'comments' ? unit.slice(0, -1) : unit}`;
      row.append(profileAvatar(person), name, value);
      list.append(row);
    }
    if (!list.children.length) {
      const row = document.createElement('li');
      row.textContent = 'Ninguém ainda — vem participar!';
      list.append(row);
    }
  }
}

TikTokBridge.on('chat', data => {
  update();
  showEvent(game.receiveChat(data));
});

TikTokBridge.on('gift', data => {
  update();
  const firstRealGift = !game.realGiftReceived;
  const event = game.receiveGift(data);
  if (event && firstRealGift) clearAnimation();
  showEvent(event);
});

async function loadAllTimeLeaders(round) {
  const username = params.get('id') || params.get('username');
  if (!username) return;
  try {
    const response = await fetch(`/api/leaderboards/${encodeURIComponent(username.trim().toLowerCase())}`);
    if (!response.ok) throw new Error('Ranking unavailable');
    const data = await response.json();
    if (!['comments', 'gifts', 'likes'].every(metric => Array.isArray(data[metric]))) throw new Error('Invalid ranking');
    if (game.round === round && !$('result').hidden) {
      allTimeLeaders = data;
      rankingScope = null;
    }
  } catch (error) {
    console.warn('[Rankings]', error.message);
  }
}

function update() {
  const now = Date.now();
  const state = game.tick(now);
  if (game.round !== lastRound) {
    lastRound = game.round;
    lastLeader = null;
    lastCountdown = null;
    clearAnimation();
    setMode(game.round, now);
    audio.play('start');
    renderScores();
    $('result').hidden = true;
  }
  renderMode(now);
  $('mode-announcement').hidden = now >= modeAnnouncementUntil || state.phase !== 'playing';
  $('round').textContent = `RODADA ${String(game.round).padStart(2, '0')}`;
  $('timer').textContent = clock(state.phase === 'playing' ? state.remaining : 0);
  $('stage').classList.toggle('urgent', state.phase === 'playing' && state.remaining <= 30000);
  $('time-fill').style.width = `${state.phase === 'playing' ? state.remaining / ROUND_MS * 100 : 0}%`;
  if (state.phase === 'result') {
    if ($('result').hidden) {
      clearAnimation();
      $('result').hidden = false;
      allTimeLeaders = null;
      rankingScope = null;
      loadAllTimeLeaders(game.round);
      $('result').classList.toggle('winner-red', state.winner === 'lula');
      $('result').classList.toggle('winner-green', state.winner === 'bolsonaro');
      $('winner-hero').hidden = !state.winner;
      $('result-star').hidden = Boolean(state.winner);
      $('winner-photo').className = `portrait winner-photo ${state.winner === 'lula' ? 'lula' : 'flavio'}`;
      $('winner-party').src = `assets/${state.winner === 'lula' ? 'pt' : 'pl'}.svg`;
      $('winner-party').alt = state.winner === 'lula' ? 'Bandeira do PT' : 'Bandeira do PL';
      const total = game.scores.lula + game.scores.bolsonaro;
      $('winner').textContent = state.winner ? TEAMS[state.winner].name.toUpperCase() : total ? 'EMPATE' : 'SEM VENCEDOR';
      $('winner').style.color = state.winner === 'lula' ? '#bf2445' : state.winner === 'bolsonaro' ? '#337510' : 'var(--outline)';
      $('result-kicker').textContent = state.winner ? 'VENCEDOR DA RODADA' : 'RODADA FINALIZADA';
      $('result-score').textContent = `${format(game.scores.lula)} × ${format(game.scores.bolsonaro)}`;
      renderLeaderboards();
      $('next-game').textContent = `PRÓXIMO: ${selectedMode(game.round + 1).name.toUpperCase()}`;
      $('result-detail').textContent = total ? 'A TORCIDA FEZ A DIFERENÇA!' : 'A próxima rodada tá chegando!';
      confetti(state.winner, 32);
      audio.play(state.winner ? 'win' : 'end');
    }
    const showAllTime = Boolean(allTimeLeaders) && Math.floor((RESULT_MS - state.remaining) / 10000) % 2 === 1;
    if (rankingScope !== showAllTime) {
      rankingScope = showAllTime;
      renderLeaderboards(showAllTime);
    }
    $('phase-label').textContent = 'RODADA ENCERRADA';
    $('next-timer').textContent = clock(state.remaining);
  } else {
    $('phase-label').textContent = state.remaining <= 30000 ? 'RETA FINAL! VAMOS VIRAR!' : 'TEMPO PRA VIRAR';
    ambientHype(now, state.remaining);
    const seconds = Math.ceil(state.remaining / 1000);
    if (seconds >= 1 && seconds <= 5 && seconds !== lastCountdown) audio.play('countdown');
    lastCountdown = seconds;
    if (demosEnabled) {
      showEvent(game.automatic(simulatedNames[Math.floor(Math.random() * simulatedNames.length)], now));
    }
  }
}
if (!demosEnabled) {
  $('activity-type').textContent = 'CHAT E PRESENTES';
}


setMode(game.round);
renderScores();
update();
setInterval(update, 250);

addEventListener('pagehide', () => modeRenderer?.destroy());
