export const MINIGAMES = [
  {id:'urna', name:'Batalha da urna', icon:'🗳️', hint:'1 voto grátis por pessoa a cada rodada.'},
  {id:'race', name:'Corrida do Planalto', icon:'🏁', hint:'Comentário dá impulso. Presente dá turbo!'},
  {id:'tug', name:'Cabo de guerra', icon:'🪢', hint:'Cada ponto puxa a corda pro seu time!'},
  {id:'tower', name:'Torre da torcida', icon:'🏗️', hint:'Cada ponto sobe mais um bloco da torre!'},
];

export function modeForRound(round, start = 'urna', fixed = false) {
  const index = Math.max(0, MINIGAMES.findIndex(mode => mode.id === start));
  return MINIGAMES[(index + (fixed ? 0 : Math.max(0, round - 1))) % MINIGAMES.length];
}
