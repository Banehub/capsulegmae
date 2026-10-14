
import type { WeaponId } from '../../shared/weapons.ts';

type SoundType = 'hit' | 'elimination' | 'damage';
type Point = { x: number; y: number; z: number };
type PendingShot = { weapon: WeaponId; at: number };

type SoundOutput = {
  node: AudioNode;
  cleanup: () => void;
};

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.8;
  private muted = false;
  private airborne = false;
  private stepIndex = 0;
  private lastStep = 0;
  private lastReloadAt = -Infinity;
  private lastReloadWeapon: WeaponId | null = null;
  private pendingShots: PendingShot[] = [];

  constructor() {
    try {
      const storedVolume = localStorage.getItem('lps-volume');

      if (storedVolume !== null) {
        const parsed = Number(storedVolume);

        if (Number.isFinite(parsed)) {
          this.volume = Math.max(0, Math.min(1, parsed));
        }
      }

      this.muted = localStorage.getItem('lps-muted') === 'true';
    } catch {
      // Storage is optional.
    }

    window.addEventListener('pointerdown', () => this.unlock(), {
      capture: true,
    });

    window.addEventListener('keydown', () => this.unlock(), {
      capture: true,
    });

    window.addEventListener('lps:local-shot', (event) => {
      if (!(event instanceof CustomEvent)) return;

      const weapon = event.detail as WeaponId;

      if (!this.isWeapon(weapon)) return;

      const now = performance.now();

      this.pendingShots = this.pendingShots.filter(
        (shot) => now - shot.at < 2500,
      );

      this.pendingShots.push({ weapon, at: now });
      this.playGunshot(weapon);
    });

    window.addEventListener('lps:reload-start', (event) => {
      if (!(event instanceof CustomEvent)) return;

      const weapon = event.detail as WeaponId;

      if (this.isWeapon(weapon)) {
        this.reload(weapon);
      }
    });

    window.addEventListener('lps:confirmed-elimination', () => {
      this.hit('elimination');
    });

    window.addEventListener('lps:jump', () => {
      this.airborne = true;
      this.jump();
    });

    window.addEventListener('lps:land', (event) => {
      this.airborne = false;

      const strength =
        event instanceof CustomEvent &&
        typeof event.detail === 'number'
          ? event.detail
          : 1;

      this.land(strength);
    });

    window.addEventListener('lps:grounded', (event) => {
      this.airborne = !(
        event instanceof CustomEvent && event.detail === true
      );
    });
  }

  private isWeapon(value: unknown): value is WeaponId {
    return (
      value === 'pistol' ||
      value === 'rifle' ||
      value === 'shotgun' ||
      value === 'sniper'
    );
  }

  unlock(): void {
    try {
      if (!this.context) {
        const AudioConstructor =
          window.AudioContext ||
          (window as Window & {
            webkitAudioContext?: typeof AudioContext;
          }).webkitAudioContext;

        if (!AudioConstructor) return;

        const context = new AudioConstructor({
          latencyHint: 'interactive',
        });

        this.context = context;
        this.master = context.createGain();

        const limiter = context.createDynamicsCompressor();

        limiter.threshold.value = -8;
        limiter.knee.value = 12;
        limiter.ratio.value = 6;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.16;

        limiter.connect(this.master);
        this.master.connect(context.destination);

        this.noiseBuffer = this.makeNoiseBuffer(context);

        this.updateVolume();
      }

      if (this.context.state === 'suspended') {
        void this.context.resume().catch(() => {});
      }
    } catch {
      // Audio must not stop the game.
    }
  }

  getVolume(): number {
    return this.volume;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : this.volume;

    try {
      localStorage.setItem('lps-volume', String(this.volume));
    } catch {
      // Storage is optional.
    }

    this.updateVolume();
  }

  setMuted(value: boolean): void {
    this.muted = value;

    try {
      localStorage.setItem('lps-muted', String(value));
    } catch {
      // Storage is optional.
    }

    this.updateVolume();
  }

  private updateVolume(): void {
    if (!this.context || !this.master) return;

    this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.volume,
      this.context.currentTime,
      0.012,
    );
  }

  private run(action: () => void): void {
    this.unlock();

    const context = this.context;

    if (!context) return;

    if (context.state === 'running') {
      action();
      return;
    }

    if (context.state === 'suspended') {
      void context.resume()
        .then(() => {
          if (context.state === 'running') {
            action();
          }
        })
        .catch(() => {});
    }
  }

  private makeNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 1.6),
      context.sampleRate,
    );

    const samples = buffer.getChannelData(0);

    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  private output(
    position?: Point,
    listener?: Point,
  ): SoundOutput | null {
    const context = this.context;
    const master = this.master;

    if (!context || !master) return null;

    const envelopeOutput = context.createGain();

    if (!position || !listener) {
      envelopeOutput.connect(master);

      return {
        node: envelopeOutput,
        cleanup: () => envelopeOutput.disconnect(),
      };
    }

    const dx = position.x - listener.x;
    const dy = position.y - listener.y;
    const dz = position.z - listener.z;

    const distance = Math.hypot(dx, dy, dz);

    const panner = context.createStereoPanner();

    panner.pan.value = Math.max(
      -0.88,
      Math.min(0.88, dx / Math.max(4, distance)),
    );

    envelopeOutput.gain.value =
      1 / (1 + distance * 0.12);

    envelopeOutput.connect(panner);
    panner.connect(master);

    return {
      node: envelopeOutput,
      cleanup: () => {
        envelopeOutput.disconnect();
        panner.disconnect();
      },
    };
  }

  private tone(
    from: number,
    to: number,
    duration: number,
    level: number,
    type: OscillatorType = 'triangle',
    delay = 0,
    position?: Point,
    listener?: Point,
  ): void {
    const context = this.context;

    if (!context || context.state !== 'running') return;

    const output = this.output(position, listener);

    if (!output) return;

    const start = context.currentTime + delay;

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(
      Math.max(1, from),
      start,
    );

    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, to),
      start + duration,
    );

    gain.gain.setValueAtTime(0.0001, start);

    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, level),
      start + Math.min(0.005, duration / 3),
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + duration,
    );

    oscillator.connect(gain);
    gain.connect(output.node);

    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);

    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      output.cleanup();
    };
  }

  private noise(
    duration: number,
    level: number,
    lowpass: number,
    delay = 0,
    position?: Point,
    listener?: Point,
    highpass = 50,
  ): void {
    const context = this.context;

    if (
      !context ||
      context.state !== 'running' ||
      !this.noiseBuffer
    ) {
      return;
    }

    const output = this.output(position, listener);

    if (!output) return;

    const start = context.currentTime + delay;

    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;

    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = lowpass;

    const high = context.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = highpass;

    const gain = context.createGain();

    gain.gain.setValueAtTime(0.0001, start);

    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, level),
      start + 0.003,
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + duration,
    );

    source.connect(low);
    low.connect(high);
    high.connect(gain);
    gain.connect(output.node);

    source.start(start, Math.random() * 0.15);
    source.stop(start + duration + 0.01);

    source.onended = () => {
      source.disconnect();
      low.disconnect();
      high.disconnect();
      gain.disconnect();
      output.cleanup();
    };
  }

  gunshot(
    weapon: WeaponId,
    position?: Point,
    listener?: Point,
  ): void {
    if (!position && !listener) {
      const now = performance.now();

      this.pendingShots = this.pendingShots.filter(
        (shot) => now - shot.at < 2500,
      );

      const index = this.pendingShots.findIndex(
        (shot) => shot.weapon === weapon,
      );

      if (index !== -1) {
        this.pendingShots.splice(index, 1);
        return;
      }
    }

    this.playGunshot(weapon, position, listener);
  }

  private playGunshot(
    weapon: WeaponId,
    position?: Point,
    listener?: Point,
  ): void {
    this.run(() => {
      const remote = Boolean(position && listener);
      const p = position;
      const l = listener;

      switch (weapon) {
        case 'pistol':
          this.noise(
            0.19,
            remote ? 0.44 : 0.7,
            8200,
            0,
            p,
            l,
            320,
          );

          this.tone(
            340,
            58,
            0.15,
            0.25,
            'sawtooth',
            0,
            p,
            l,
          );

          this.noise(0.11, 0.14, 1800, 0.075, p, l, 100);

          if (!remote) {
            this.tone(
              1200,
              420,
              0.035,
              0.07,
              'square',
              0.045,
            );
          }
          break;

        case 'rifle':
          this.noise(
            0.17,
            remote ? 0.42 : 0.69,
            11000,
            0,
            p,
            l,
            470,
          );

          this.tone(
            245,
            47,
            0.13,
            0.3,
            'sawtooth',
            0,
            p,
            l,
          );

          this.noise(0.12, 0.19, 2100, 0.05, p, l, 80);

          if (!remote) {
            this.noise(0.028, 0.13, 7800, 0.115);
          }
          break;

        case 'shotgun':
          this.noise(
            0.48,
            remote ? 0.52 : 0.86,
            6800,
            0,
            p,
            l,
            130,
          );

          this.tone(
            175,
            28,
            0.38,
            0.44,
            'sawtooth',
            0,
            p,
            l,
          );

          this.noise(0.3, 0.27, 1300, 0.085, p, l, 65);

          if (!remote) {
            this.noise(0.065, 0.19, 4800, 0.34);

            this.tone(
              540,
              135,
              0.075,
              0.13,
              'square',
              0.38,
            );
          }
          break;

        case 'sniper':
          this.noise(
            0.72,
            remote ? 0.58 : 0.95,
            8500,
            0,
            p,
            l,
            180,
          );

          this.tone(
            180,
            23,
            0.52,
            0.48,
            'sawtooth',
            0,
            p,
            l,
          );

          this.noise(0.59, 0.25, 1700, 0.1, p, l, 70);
          this.noise(0.42, 0.1, 900, 0.36, p, l, 65);

          if (!remote) {
            this.tone(
              780,
              210,
              0.09,
              0.1,
              'triangle',
              0.59,
            );
          }
          break;
      }
    });
  }

  hit(type: SoundType = 'hit'): void {
    this.run(() => {
      if (type === 'elimination') {
        this.tone(
          1250,
          620,
          0.12,
          0.28,
          'square',
        );

        this.tone(
          890,
          190,
          0.23,
          0.22,
          'triangle',
          0.05,
        );

        this.noise(
          0.11,
          0.08,
          2900,
          0.035,
          undefined,
          undefined,
          700,
        );
      } else if (type === 'damage') {
        this.noise(0.34, 0.31, 1400);

        this.tone(
          145,
          35,
          0.26,
          0.26,
          'sawtooth',
        );

        this.tone(
          440,
          150,
          0.14,
          0.08,
          'triangle',
          0.025,
        );
      } else {
        this.tone(
          1650,
          990,
          0.095,
          0.21,
          'square',
        );

        this.tone(
          2050,
          1250,
          0.055,
          0.12,
          'sine',
          0.014,
        );
      }
    });
  }

  reload(weapon: WeaponId): void {
    const now = performance.now();

    if (
      this.lastReloadWeapon === weapon &&
      now - this.lastReloadAt < 350
    ) {
      return;
    }

    this.lastReloadWeapon = weapon;
    this.lastReloadAt = now;

    this.run(() => {
      if (weapon === 'shotgun') {
        for (let i = 0; i < 4; i++) {
          const delay = i * 0.42;

          this.noise(0.065, 0.19, 3500, delay);

          this.tone(
            560,
            155,
            0.075,
            0.15,
            'triangle',
            delay + 0.025,
          );

          this.noise(
            0.045,
            0.1,
            5200,
            delay + 0.105,
          );
        }

        this.noise(0.1, 0.2, 4800, 1.9);
        return;
      }

      this.noise(0.08, 0.19, 3800);

      this.tone(
        550,
        160,
        0.09,
        0.16,
        'triangle',
        0.02,
      );

      this.noise(0.105, 0.14, 2200, 0.19);

      this.tone(
        200,
        490,
        0.085,
        0.13,
        'square',
        0.3,
      );

      this.noise(0.07, 0.29, 6000, 0.48);

      this.tone(
        300,
        750,
        0.065,
        0.14,
        'square',
        0.49,
      );

      this.noise(
        0.07,
        0.15,
        4400,
        weapon === 'sniper' ? 0.78 : 0.61,
      );
    });
  }

  equip(): void {
    this.run(() => {
      this.noise(0.065, 0.2, 3200);

      this.tone(
        260,
        620,
        0.075,
        0.13,
        'triangle',
      );

      this.noise(0.05, 0.12, 4200, 0.095);
    });
  }

  footstep(running = false): void {
    if (this.airborne) return;

    const now = performance.now();
    const interval = running ? 205 : 365;

    if (now - this.lastStep < interval) return;

    this.lastStep = now;

    const variation =
      ++this.stepIndex % 2 === 0 ? 1.09 : 0.92;

    this.run(() => {
      this.noise(
        running ? 0.14 : 0.11,
        (running ? 0.22 : 0.13) * variation,
        running ? 1350 : 1100,
      );

      this.tone(
        120 * variation,
        39,
        0.11,
        running ? 0.115 : 0.073,
        'sine',
      );

      this.noise(
        0.055,
        running ? 0.095 : 0.06,
        2900,
        0.045,
      );
    });
  }

  jump(): void {
    this.run(() => {
      this.noise(0.16, 0.28, 1700);

      this.tone(
        95,
        215,
        0.19,
        0.17,
        'triangle',
      );

      this.noise(0.09, 0.105, 4200, 0.055);
    });
  }

  land(strength = 1): void {
    const amount = Math.max(
      0.5,
      Math.min(1.8, strength),
    );

    this.lastStep = performance.now();

    this.run(() => {
      this.noise(0.25, 0.29 * amount, 1300);

      this.tone(
        125,
        30,
        0.21,
        0.2 * amount,
        'sine',
      );

      this.noise(
        0.13,
        0.11 * amount,
        3100,
        0.04,
      );
    });
  }

  victory(): void {
    this.run(() => {
      this.tone(
        392,
        392,
        0.22,
        0.16,
        'sine',
      );

      this.tone(
        494,
        494,
        0.22,
        0.16,
        'sine',
        0.16,
      );

      this.tone(
        587,
        587,
        0.26,
        0.17,
        'sine',
        0.32,
      );

      this.tone(
        784,
        784,
        0.52,
        0.22,
        'sine',
        0.52,
      );
    });
  }
}
