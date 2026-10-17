export const ROUND_MS = 5 * 60 * 1000;
export const RESULT_MS = 60 * 1000;
export const TEAMS = {
  lula: { name: 'Lula', number: '13', gifts: ['Rose', 'Heart'] },
  bolsonaro: { name: 'Flávio Bolsonaro', shortName: 'Flávio', number: '22', gifts: ['White Rose', 'Tiny Diny'] },
};
const giftNames = new Map([
  ['rose', 'lula'], ['heart', 'lula'],
  ['white rose', 'bolsonaro'], ['tiny diny', 'bolsonaro'],
]);

export class UrnaBattle {
  constructor(now = Date.now()) {
    this.round = 1;
    this.reset(now);
  }

  reset(now) {
    this.startedAt = now;
    this.scores = { lula: 0, bolsonaro: 0 };
    this.simulated = { lula: 0, bolsonaro: 0 };
    this.events = [];
    this.seen = new Set();
    this.chatVoters = new Set();
    this.supporters = new Map();
    this.realGiftReceived = false;
    this.nextAutomatic = now + 5000;
    this.pressureTeam = null;
    this.pressureUntil = now;
  }

  tick(now = Date.now()) {
    const elapsed = Math.max(0, now - this.startedAt);
    const cycles = Math.floor(elapsed / (ROUND_MS + RESULT_MS));
    if (cycles) {
      this.round += cycles;
      this.reset(this.startedAt + cycles * (ROUND_MS + RESULT_MS));
    }
    const phaseElapsed = Math.max(0, now - this.startedAt);
    const phase = phaseElapsed < ROUND_MS ? 'playing' : 'result';
    const remaining = phase === 'playing' ? ROUND_MS - phaseElapsed : ROUND_MS + RESULT_MS - phaseElapsed;
    const winner = this.scores.lula === this.scores.bolsonaro ? null
      : this.scores.lula > this.scores.bolsonaro ? 'lula' : 'bolsonaro';
    return { phase, remaining, winner };
  }

  addActivity(user, metric, amount) {
    const id = typeof user?.uniqueId === 'string' ? user.uniqueId.trim().toLowerCase() : '';
    if (!id || !Number.isSafeInteger(amount) || amount <= 0) return;
    const person = this.supporters.get(id) || {id, nickname: user.nickname || id, comments: 0, gifts: 0, likes: 0};
    if (!Number.isSafeInteger(person[metric] + amount)) return;
    person.nickname = user.nickname || id;
    if (user.profilePictureUrl) person.profilePictureUrl = user.profilePictureUrl;
    person[metric] += amount;
    this.supporters.set(id, person);
  }

  leaderboard(metric) {
    return [...this.supporters.values()].filter(person => person[metric] > 0)
      .sort((a, b) => b[metric] - a[metric] || a.id.localeCompare(b.id)).slice(0, 3);
  }

  receiveLike(data, now = Date.now()) {
    if (this.tick(now).phase !== 'playing') return;
    this.addActivity(data.user, 'likes', data.likeCount);
  }

  receiveChat(data, now = Date.now()) {
    if (this.tick(now).phase !== 'playing') return null;
    const comment = typeof data.comment === 'string' ? data.comment.trim() : '';
    if (comment) this.addActivity(data.user, 'comments', 1);
    const has13 = comment.includes('13'), has22 = comment.includes('22');
    const team = has13 === has22 ? null : has13 ? 'lula' : 'bolsonaro';
    const userId = typeof data.user?.uniqueId === 'string' ? data.user.uniqueId.trim().toLowerCase() : '';
    if (!team || !userId || this.chatVoters.has(userId) || !Number.isSafeInteger(this.scores[team] + 1)) return null;
    this.chatVoters.add(userId);
    this.scores[team]++;
    return this.record({team, points: 1, nickname: data.user.nickname || userId,
      profilePictureUrl: data.user.profilePictureUrl, gift: `Comentário ${TEAMS[team].number}`, count: 1, simulated: false, kind: 'chat'});
  }

  receiveGift(data, now = Date.now()) {
    if (this.tick(now).phase !== 'playing') return null;
    // Only the final cumulative streak counts; intermediate and final frames overlap.
    if (data.streakType === 1 && !data.repeatEnd) return null;
    const name = typeof data.giftName === 'string' ? data.giftName.toLowerCase().trim() : '';
    const team = data.giftId === 5655 ? 'lula' : giftNames.get(name);
    const value = Number(data.giftValue);
    const count = Number(data.repeatCount);
    if (!Number.isSafeInteger(value) || value <= 0 || !Number.isSafeInteger(count) || count <= 0) return null;
    const points = value * count;
    if (!Number.isSafeInteger(points) || (team && !Number.isSafeInteger(this.scores[team] + points))) return null;
    if (data.eventId && this.seen.has(data.eventId)) return null;
    if (data.eventId) {
      this.seen.add(data.eventId);
      if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value);
    }
    this.addActivity(data.user, 'gifts', points);
    if (!team) return null;
    this.realGiftReceived = true;
    this.scores[team] += points;
    return this.record({ team, points, nickname: data.user?.nickname || 'Espectador', profilePictureUrl: data.user?.profilePictureUrl, gift: data.giftName, count, simulated: false });
  }

  automatic(nickname, now = Date.now(), random = Math.random) {
    if (this.tick(now).phase !== 'playing' || this.realGiftReceived || now < this.nextAutomatic) return null;
    this.nextAutomatic = now + 5000 + random() * 25000;
    if (now >= this.pressureUntil) {
      this.pressureTeam = this.pressureTeam === 'lula' ? 'bolsonaro'
        : this.pressureTeam === 'bolsonaro' ? 'lula' : random() < .5 ? 'lula' : 'bolsonaro';
      this.pressureUntil = now + 40000 + random() * 30000;
    }
    const total = this.simulated.lula + this.simulated.bolsonaro;
    const imbalance = total ? (this.simulated.lula - this.simulated.bolsonaro) / total : 0;
    const lulaChance = Math.max(.15, Math.min(.85,
      .5 + (this.pressureTeam === 'lula' ? .25 : -.25) - imbalance * .8));
    const team = random() < lulaChance ? 'lula' : 'bolsonaro';
    return this.simulate(team, nickname, now);
  }

  simulate(team, nickname, now = Date.now(), points = 1) {
    if (this.tick(now).phase !== 'playing' || !TEAMS[team]) return null;
    if (!Number.isSafeInteger(points) || points <= 0 || (team && !Number.isSafeInteger(this.scores[team] + points))) return null;
    this.simulated[team] += points;
    this.scores[team] += points;
    return this.record({ team, points, nickname, gift: TEAMS[team].gifts[0], count: points, simulated: true });
  }

  record(event) {
    this.events.unshift(event);
    this.events.length = Math.min(4, this.events.length);
    return event;
  }
}
