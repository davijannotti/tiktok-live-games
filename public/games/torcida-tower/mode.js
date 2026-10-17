const TEAMS = ['lula', 'bolsonaro'];
const NAMES = { lula: 'LULA', bolsonaro: 'FLÁVIO' };

export function towerHeights(scores) {
  const highest = Math.max(12, scores.lula, scores.bolsonaro);
  return Object.fromEntries(TEAMS.map(team => [team, scores[team] / highest * 120]));
}

export function createMode(root, { reducedMotion = false } = {}) {
  const doc = root.ownerDocument;
  const animations = new Set();
  let destroyed = false;
  function element(tag, className, parent, text) {
    const el = doc.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    parent.append(el);
    return el;
  }
  const board = element('section', 'torcida-tower', root);
  board.setAttribute('aria-label', 'Torre da torcida: cada ponto aumenta a torre do seu candidato');
  board.classList.toggle('torcida-tower--still', reducedMotion);
  const title = element('h2', 'torcida-tower__title', board, 'TORRE DA TORCIDA');
  const status = element('p', 'torcida-tower__status', board, 'COMENTE 13 OU 22. FAÇA SEU TIME SUBIR!');
  const field = element('div', 'torcida-tower__field', board);
  const lanes = {};
  for (const team of TEAMS) {
    const lane = element('div', `torcida-tower__lane torcida-tower__lane--${team}`, field);
    const stack = element('div', 'torcida-tower__stack', lane);
    const climber = element('div', 'torcida-tower__climber', lane);
    const flag = element('img', 'torcida-tower__flag', climber);
    flag.src = `../urna-battle/assets/${team === 'lula' ? 'pt' : 'pl'}.svg`;
    flag.alt = team === 'lula' ? 'Bandeira do PT' : 'Bandeira do PL';
    const face = element('div', 'torcida-tower__face', climber);
    face.setAttribute('role', 'img');
    face.setAttribute('aria-label', NAMES[team]);
    const points = element('strong', 'torcida-tower__points', lane, '0');
    element('span', 'torcida-tower__name', lane, NAMES[team]);
    lanes[team] = { lane, stack, climber, points };
  }
  const brazil = element('img', 'torcida-tower__brasil', field);
  brazil.src = '../urna-battle/assets/brasil.svg';
  brazil.alt = 'Brasil';

  function play(el, frames, options, remove = false) {
    if (reducedMotion || typeof el.animate !== 'function') { if (remove) el.remove(); return; }
    const animation = el.animate(frames, options);
    animations.add(animation);
    animation.onfinish = () => { animations.delete(animation); if (remove) el.remove(); };
  }

  return {
    render({ scores, phase, winner }) {
      if (destroyed) return;
      const heights = towerHeights(scores);
      const leader = scores.lula === scores.bolsonaro ? null : scores.lula > scores.bolsonaro ? 'lula' : 'bolsonaro';
      for (const team of TEAMS) {
        const { lane, stack, climber, points } = lanes[team];
        stack.style.height = `${heights[team]}px`;
        climber.style.bottom = `${35 + heights[team]}px`;
        points.textContent = scores[team].toLocaleString('pt-BR');
        lane.classList.toggle('torcida-tower__lane--leading', team === leader);
        lane.classList.toggle('torcida-tower__lane--winner', phase === 'result' && team === winner);
      }
      title.textContent = phase === 'result' ? 'CHEGAMOS AO TOPO!' : 'TORRE DA TORCIDA';
      status.textContent = phase === 'result'
        ? winner ? `${NAMES[winner]} CONSTRUIU A MAIOR TORCIDA!` : 'TORRES IGUAIS! DEU EMPATE!'
        : leader ? `${NAMES[leader]} NO ALTO! CADA PONTO É UM BLOCO!` : 'COMENTE 13 OU 22. FAÇA SEU TIME SUBIR!';
    },
    onScore(event) {
      if (destroyed || !lanes[event.team]) return;
      const { lane, climber } = lanes[event.team];
      play(climber, [{ transform: 'rotate(0)' }, { transform: 'translateY(-7px) rotate(-7deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0)' }], { duration: 650, easing: 'ease-out' });
      if (reducedMotion) return;
      const burst = element('span', 'torcida-tower__burst', lane, `+${event.points} ${event.points === 1 ? 'BLOCO' : 'BLOCOS'}`);
      play(burst, [{ opacity: 0, transform: 'translateY(5px) scale(.7)' }, { opacity: 1, transform: 'translateY(-10px) scale(1)', offset: .25 }, { opacity: 0, transform: 'translateY(-45px) scale(1)' }], { duration: 1200, easing: 'ease-out' }, true);
    },
    destroy() {
      destroyed = true;
      for (const animation of animations) animation.cancel();
      animations.clear();
      board.remove();
    },
  };
}
