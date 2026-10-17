export function createMode(root, { reducedMotion = false } = {}) {
  const view = root.ownerDocument.createElement('section');
  view.className = 'torcida-tug';
  view.setAttribute('aria-label', 'Cabo de guerra na praça');
  if (reducedMotion) view.classList.add('torcida-tug-reduced');
  view.innerHTML = `
    <div class="torcida-tug-heading"><img src="../urna-battle/assets/brasil.svg" alt=""> CABO DE GUERRA <img src="../urna-battle/assets/brasil.svg" alt=""></div>
    <p class="torcida-tug-status" role="status">A praça tá dividida. Puxa pro seu time!</p>
    <div class="torcida-tug-plaza">
      <div class="torcida-tug-crowd torcida-tug-crowd-left" aria-hidden="true">🙌🏽 🙌🏻 🙌🏿</div>
      <div class="torcida-tug-crowd torcida-tug-crowd-right" aria-hidden="true">🙌🏿 🙌🏽 🙌🏻</div>
      <div class="torcida-tug-center" aria-hidden="true"></div>
      <div class="torcida-tug-team torcida-tug-lula"><img class="torcida-tug-party" src="../urna-battle/assets/pt.svg" alt="PT"><div class="torcida-tug-puller torcida-tug-puller-lula"><div class="torcida-tug-face torcida-tug-face-lula"></div><div class="torcida-tug-body"></div><div class="torcida-tug-arm"></div><span class="torcida-tug-feet">◢ ◣</span></div><strong>LULA <b class="torcida-tug-score-lula">0</b></strong></div>
      <div class="torcida-tug-team torcida-tug-bolsonaro"><img class="torcida-tug-party" src="../urna-battle/assets/pl.svg" alt="PL"><div class="torcida-tug-puller torcida-tug-puller-bolsonaro"><div class="torcida-tug-face torcida-tug-face-bolsonaro"></div><div class="torcida-tug-body"></div><div class="torcida-tug-arm"></div><span class="torcida-tug-feet">◢ ◣</span></div><strong>FLÁVIO <b class="torcida-tug-score-bolsonaro">0</b></strong></div>
      <div class="torcida-tug-rope" aria-hidden="true"><span class="torcida-tug-knot">🎀</span></div>
      <div class="torcida-tug-dust" aria-hidden="true">✦</div>
    </div>
    <div class="torcida-tug-track" aria-hidden="true"><span></span></div>
    <div class="torcida-tug-instruction">COMENTE <b>13</b> OU <b>22</b> · CADA APOIO É UM PUXÃO!</div>`;
  root.append(view);
  const status = view.querySelector('.torcida-tug-status');
  const pullers = Object.fromEntries(['lula', 'bolsonaro'].map(team => [team, view.querySelector(`.torcida-tug-puller-${team}`)]));
  const scoreLabels = Object.fromEntries(['lula', 'bolsonaro'].map(team => [team, view.querySelector(`.torcida-tug-score-${team}`)]));
  const animations = new Set();
  let destroyed = false, phase = 'playing';
  return {
    render({ scores, remaining, phase: nextPhase, winner }) {
      if (destroyed) return;
      phase = nextPhase;
      for (const team of ['lula', 'bolsonaro']) scoreLabels[team].textContent = scores[team].toLocaleString('pt-BR');
      const total = scores.lula + scores.bolsonaro;
      const advantage = total ? (scores.bolsonaro - scores.lula) / total : 0;
      view.style.setProperty('--tug-shift', `${advantage * 46}px`);
      view.style.setProperty('--tug-meter', `${50 + advantage * 44}%`);
      view.classList.toggle('torcida-tug-finished', phase !== 'playing');
      view.classList.toggle('torcida-tug-winner-lula', phase !== 'playing' && winner === 'lula');
      view.classList.toggle('torcida-tug-winner-bolsonaro', phase !== 'playing' && winner === 'bolsonaro');
      if (phase !== 'playing') status.textContent = winner ? `${winner === 'lula' ? 'Lula' : 'Flávio'} puxou a vitória!` : 'Empatou! As duas torcidas seguraram firme!';
      else if (scores.lula === scores.bolsonaro) status.textContent = 'Tá empatado! Quem vai dar o próximo puxão?';
      else status.textContent = `${advantage < 0 ? 'Lula' : 'Flávio'} na frente! ${remaining <= 30000 ? 'ÚLTIMOS PUXÕES!' : 'A outra torcida ainda pode recuperar!'}`;
    },
    onScore(event) {
      if (destroyed || phase !== 'playing' || reducedMotion || !pullers[event.team]) return;
      // Cosmetic tug only: scoring and the winner always belong to the shared engine.
      for (const animation of animations) animation.cancel();
      animations.clear();
      const direction = event.team === 'lula' ? -1 : 1;
      for (const [team, puller] of Object.entries(pullers)) {
        const pulling = team === event.team;
        const animation = puller.animate([
          { transform: 'translateX(0) rotate(0)' },
          { transform: `translateX(${direction * (pulling ? 9 : 5)}px) rotate(${direction * (pulling ? 8 : -7)}deg)` },
          { transform: 'translateX(0) rotate(0)' },
        ], { duration: pulling ? 650 : 850, easing: 'ease-out' });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      }
    },
    destroy() {
      destroyed = true;
      for (const animation of animations) animation.cancel();
      animations.clear();
      view.remove();
    },
  };
}
