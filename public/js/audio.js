// public/js/audio.js - Procedural Web Audio Arcade Synthesizer

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.bgmGain = null;

    // Preferences
    this.masterVol = 0.8;
    this.sfxVol = 0.85;
    this.bgmVol = 0.45;
    this.bgmEnabled = true;
    this.isMuted = false;

    // BGM sequencer state
    this.bgmInterval = null;
    this.bgmStep = 0;
    this.isBgmPlaying = false;

    this.loadPreferences();
  }

  // AudioContext must be initiated/resumed on user gesture
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVol, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // SFX Bus
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVol, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // BGM Bus
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(this.bgmVol, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);
    } catch (e) {
      console.warn('Web Audio not supported or failed to initialize:', e);
    }
  }

  loadPreferences() {
    try {
      const saved = localStorage.getItem('chaos_arena_audio');
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.masterVol === 'number') this.masterVol = data.masterVol;
        if (typeof data.sfxVol === 'number') this.sfxVol = data.sfxVol;
        if (typeof data.bgmVol === 'number') this.bgmVol = data.bgmVol;
        if (typeof data.bgmEnabled === 'boolean') this.bgmEnabled = data.bgmEnabled;
        if (typeof data.isMuted === 'boolean') this.isMuted = data.isMuted;
      }
    } catch (e) {}
  }

  savePreferences() {
    try {
      localStorage.setItem('chaos_arena_audio', JSON.stringify({
        masterVol: this.masterVol,
        sfxVol: this.sfxVol,
        bgmVol: this.bgmVol,
        bgmEnabled: this.bgmEnabled,
        isMuted: this.isMuted
      }));
    } catch (e) {}
  }

  setMasterVolume(val) {
    this.masterVol = Math.max(0, Math.min(1, val));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.masterVol, this.ctx.currentTime);
    }
    this.savePreferences();
  }

  setSfxVolume(val) {
    this.sfxVol = Math.max(0, Math.min(1, val));
    if (this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(this.sfxVol, this.ctx.currentTime);
    }
    this.savePreferences();
  }

  setBgmVolume(val) {
    this.bgmVol = Math.max(0, Math.min(1, val));
    if (this.bgmGain) {
      this.bgmGain.gain.setValueAtTime(this.bgmVol, this.ctx.currentTime);
    }
    this.savePreferences();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVol, this.ctx.currentTime);
    }
    this.savePreferences();
    return this.isMuted;
  }

  setBgmEnabled(enabled) {
    this.bgmEnabled = Boolean(enabled);
    if (!this.bgmEnabled && this.isBgmPlaying) {
      this.stopBGM();
    } else if (this.bgmEnabled && !this.isBgmPlaying && this.ctx) {
      this.startBGM();
    }
    this.savePreferences();
  }

  // --- SOUND EFFECTS (SYNTHESIZED PROCEDURALLY) ---

  // 1. Coin Collect Chime
  playCoinSound(isGiant = false, isDouble = false) {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isGiant ? 'triangle' : 'sine';
    const baseFreq = isGiant ? 440 : (isDouble ? 880 : 660);

    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.08);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGiant ? 0.25 : 0.12));

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + (isGiant ? 0.25 : 0.12));
  }

  // 2. Power-Up Collect (Rising arpeggio)
  playPowerUpSound() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const notes = [330, 440, 554, 660, 880];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      gain.gain.setValueAtTime(0.25, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.1);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.1);
    });
  }

  // 3. Pinball Bumper Bounce
  playBumperSound() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // 4. Hazard Hit / Stun
  playHazardSound() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.25);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  // 5. Shield Absorbed (Energy pop)
  playShieldAbsorbSound() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.2);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // 6. Chaos Siren Alert
  playChaosSound() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.2);
    osc.frequency.linearRampToValueAtTime(400, now + 0.4);
    osc.frequency.linearRampToValueAtTime(900, now + 0.6);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.7);
  }

  // 7. Countdown Blip (3.. 2.. 1.. GO!)
  playCountdownSound(isGo = false) {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    const freq = isGo ? 880 : 440;
    const duration = isGo ? 0.35 : 0.15;

    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  // 8. Victory Fanfare Jingle
  playVictoryFanfare() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const fanfare = [
      { f: 523.25, d: 0.12 }, // C5
      { f: 659.25, d: 0.12 }, // E5
      { f: 783.99, d: 0.12 }, // G5
      { f: 1046.50, d: 0.4 }  // C6
    ];

    let t = this.ctx.currentTime;
    fanfare.forEach(note => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, t);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + note.d);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + note.d);
      t += note.d + 0.04;
    });
  }

  // --- PROCEDURAL RETRO 8-BIT BGM ENGINE ---
  startBGM() {
    this.init();
    if (!this.ctx || !this.bgmEnabled || this.isBgmPlaying) return;

    this.isBgmPlaying = true;
    this.bgmStep = 0;

    // Synth Bassline progression (E minor cyberpunk arpeggio pattern)
    const bassline = [164.81, 164.81, 196.00, 164.81, 220.00, 196.00, 146.83, 164.81];

    if (this.bgmInterval) clearInterval(this.bgmInterval);
    this.bgmInterval = setInterval(() => {
      if (!this.isBgmPlaying || !this.ctx || this.isMuted) return;

      const now = this.ctx.currentTime;
      const freq = bassline[this.bgmStep % bassline.length];
      this.bgmStep++;

      // Synth bass note
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(now);
      osc.stop(now + 0.18);
    }, 220); // ~136 BPM
  }

  stopBGM() {
    this.isBgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }
}

// Global singleton instance
window.audioManager = new AudioManager();
