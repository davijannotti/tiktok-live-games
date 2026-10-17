const musicTracks = [
  {file:'carnival-brasil.mp3', title:'Carnival Brasil', artist:'Shane Ivers', source:'https://www.silvermansound.com/free-music/carnaval'},
  {file:'accordion-street-sway.mp3', title:'Accordion Street Sway', artist:'BudgetPixel AI', source:'https://budgetpixel.com/background-music/accordion-street-sway-4ab5fddd'},
  {file:'cumbia-street-stroll.mp3', title:'Cumbia Street Stroll', artist:'BudgetPixel AI', source:'https://budgetpixel.com/background-music/cumbia-street-stroll-7d318a9f'},
  {file:'funky-brazilian-phonk.mp3', title:'Funky Brazilian Phonk', artist:'BudgetPixel AI', source:'https://budgetpixel.com/background-music/funky-brazilian-phonk-54fb718d'},
];

// Short, original arcade cues synthesized locally; no sound-effect downloads.
const cues = {
  key: [[560, 0, .045]],
  point: [[660, 0, .09], [880, .09, .15]],
  big: [[523, 0, .1], [659, .08, .1], [784, .16, .1], [1047, .24, .25]],
  comeback: [[392, 0, .12], [523, .1, .12], [659, .2, .12], [1047, .3, .3]],
  countdown: [[740, 0, .07]],
  start: [[523, 0, .12], [659, .12, .12], [784, .24, .25]],
  win: [[523, 0, .13], [659, .13, .13], [784, .26, .13], [1047, .4, .5], [659, .4, .5], [784, .4, .5]],
  end: [[523, 0, .15], [392, .2, .3]],
};

export class GameAudio {
  constructor() {
    this.music = document.getElementById('background-music');
    this.enabled = false;
    this.stopped = false;
    this.context = null;
    this.voices = new Set();
    this.duckTimer = null;
    this.music.volume = .18;
    this.music.loop = false;
    this.remainingTracks = [];
    this.failedTracks = new Set();
    this.currentTrack = null;
    this.music.onended = () => this.nextTrack();
    this.music.onerror = () => {
      if (this.currentTrack) this.failedTracks.add(this.currentTrack.file);
      this.nextTrack();
    };
    this.nextTrack(false);
    this.unlock = () => { void this.start(); };
    addEventListener('pointerdown', this.unlock);
    addEventListener('keydown', this.unlock);
    addEventListener('pagehide', () => this.stop());
    void this.start();
  }

  nextTrack(play = true) {
    if (this.stopped) return;
    if (!this.remainingTracks.length) this.remainingTracks = musicTracks.filter(track => !this.failedTracks.has(track.file));
    const candidates = this.remainingTracks.filter(track => track !== this.currentTrack);
    const track = candidates[Math.floor(Math.random() * candidates.length)] || this.remainingTracks[0];
    if (!track) return;
    this.remainingTracks.splice(this.remainingTracks.indexOf(track), 1);
    this.currentTrack = track;
    this.music.src = `assets/audio/${track.file}`;
    const credit = document.getElementById('music-credit');
    if (credit) {
      credit.textContent = `${track.title} — ${track.artist}`;
      credit.href = track.source;

    }
    if (play) void this.music.play().catch(() => {});
  }

  updateVolumes() {
    this.music.volume = .18 * (this.duckTimer ? .35 : 1);
  }

  async start() {
    if (this.stopped || (this.enabled && this.context?.state === 'running' && !this.music.paused)) return;
    try {
      if (!this.context) {
        const AudioEngine = globalThis.AudioContext || globalThis.webkitAudioContext;
        this.context = new AudioEngine();
        this.effects = this.context.createGain();
        this.effects.gain.value = .3;
        this.effects.connect(this.context.destination);
      }
      // Try autoplay; a blocked browser retries on the first gesture without a panel.
      void this.music.play().catch(() => {});
      await this.context.resume();
      if (this.stopped) return;
      if (!this.enabled) {
        this.enabled = true;
        this.play('start');
      }
    } catch {
      // Autoplay policies or unavailable audio must never interrupt the game.
    }
  }

  clearEffects() {
    clearTimeout(this.duckTimer);
    this.duckTimer = null;
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    this.updateVolumes();
  }

  stop() {
    this.stopped = true;
    this.enabled = false;
    this.clearEffects();
    this.music.onended = null;
    this.music.onerror = null;
    this.music.pause();
    removeEventListener('pointerdown', this.unlock);
    removeEventListener('keydown', this.unlock);
    if (this.context) void this.context.suspend().catch(() => {});
  }

  play(cue) {
    // Drop muted/blocked cues instead of replaying an old backlog after enabling sound.
    if (!this.enabled || this.context?.state !== 'running' || !cues[cue] || this.voices.size >= 24) return;
    if (['big', 'comeback', 'win'].includes(cue)) {
      clearTimeout(this.duckTimer);
      this.duckTimer = setTimeout(() => {
        this.duckTimer = null;
        this.updateVolumes();
      }, 1200);
      this.updateVolumes();
    }
    const now = this.context.currentTime;
    for (const [frequency, delay, duration] of cues[cue]) {
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      oscillator.type = cue === 'key' ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      const start = now + delay;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(cue === 'key' ? .12 : .22, start + .008);
      envelope.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(this.effects);
      this.voices.add(oscillator);
      oscillator.onended = () => {
        this.voices.delete(oscillator);
        oscillator.disconnect();
        envelope.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
    }
  }
}
