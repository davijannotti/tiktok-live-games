export const name = 'Corrida do Planalto';
export const hint = 'COMENTE 13 OU 22 • PRESENTE VIRA TURBO!';

export function racePositions(scores, phase, winner, progress = 0) {
  const base = Math.min(1, Math.max(0, progress)) * .55;
  const positions = {};
  for (const team of ['lula', 'bolsonaro']) {
    const points = Math.max(0, Number(scores[team]) || 0);
    positions[team] = base + points / (points + 30) * (.82 - base);
    if (phase === 'result' && winner === team) positions[team] = 1;
  }
  return positions;
}

export function createMode(root, { reducedMotion = false } = {}) {
  root.classList.add('planalto-race');
  root.classList.toggle('planalto-race-reduced', reducedMotion);
  root.innerHTML = `
    <div class="planalto-race-scenery" aria-hidden="true"><img src="/games/urna-battle/assets/brasil.svg" alt=""> SUA TORCIDA ACELERA! <span>🏁</span></div>
    <div class="planalto-race-track">
      ${[['lula', 'Lula', '13', 'pt'], ['bolsonaro', 'Flávio', '22', 'pl']].map(([team, label, number, party]) => `
        <div class="planalto-race-lane" data-team="${team}">
          <span class="planalto-race-team">${label} <b>${number}</b> <strong data-score="${team}">0</strong> pts</span>
          <div class="planalto-race-runway">
            <div class="planalto-race-car" data-car="${team}" role="img" aria-label="Carrinho de ${label}">
              <span class="planalto-race-flame" aria-hidden="true">🔥</span>
              <span class="planalto-race-head" aria-hidden="true"></span>
              <span class="planalto-race-body"><img src="/games/urna-battle/assets/${party}.svg" alt="${party.toUpperCase()}"><b>${number}</b></span>
              <span class="planalto-race-wheel planalto-race-wheel-back"></span><span class="planalto-race-wheel planalto-race-wheel-front"></span>
              <span class="planalto-race-boost" aria-hidden="true"></span>
            </div>
          </div>
          <span class="planalto-race-finish" aria-hidden="true"></span>
        </div>`).join('')}
    </div>
    <p class="planalto-race-status" role="status">LARGADA! QUEM LEVA ESSA?</p>`;
  const cars = Object.fromEntries(['lula', 'bolsonaro'].map(team => [team, root.querySelector(`[data-car="${team}"]`)]));
  const status = root.querySelector('.planalto-race-status');
  const timeouts = new Map();
  let destroyed = false;
  let finished = false;
  return {
    render({ scores, phase, winner, elapsed = 0, duration = 1 }) {
      if (destroyed) return;
      finished = phase === 'result';
      const positions = racePositions(scores, phase, winner, elapsed / Math.max(1, duration));
      root.classList.toggle('planalto-race-finished', finished);
      for (const team of ['lula', 'bolsonaro']) {
        root.querySelector(`[data-score="${team}"]`).textContent = scores[team].toLocaleString('pt-BR');
        cars[team].style.left = `${positions[team] * 100}%`;
        cars[team].classList.toggle('planalto-race-winner', finished && winner === team);
      }
      const leader = scores.lula === scores.bolsonaro ? null : scores.lula > scores.bolsonaro ? 'lula' : 'bolsonaro';
      status.textContent = finished
        ? winner ? `${winner === 'lula' ? 'LULA' : 'FLÁVIO'} CRUZOU NA FRENTE! 🏆` : 'EMPATE NA LINHA DE CHEGADA!'
        : leader ? `${leader === 'lula' ? 'LULA' : 'FLÁVIO'} NA FRENTE! SUA TORCIDA ACELERA!` : 'LADO A LADO! QUEM DESEMPATA?';
    },
    onScore(event) {
      const car = cars[event.team];
      if (destroyed || finished || !car) return;
      clearTimeout(timeouts.get(event.team));
      car.classList.remove('planalto-race-turbo');
      car.querySelector('.planalto-race-boost').textContent = event.kind !== 'chat' && event.gift && !event.simulated ? 'TURBO!' : 'VAI!';
      // Reinicia o impulso mesmo quando chegam presentes consecutivos.
      void car.offsetWidth;
      car.classList.add('planalto-race-turbo');
      timeouts.set(event.team, setTimeout(() => {
        car.classList.remove('planalto-race-turbo');
        timeouts.delete(event.team);
      }, 1200));
    },
    destroy() {
      destroyed = true;
      for (const timeout of timeouts.values()) clearTimeout(timeout);
      timeouts.clear();
      root.replaceChildren();
      root.classList.remove('planalto-race', 'planalto-race-reduced', 'planalto-race-finished');
    }
  };
}
