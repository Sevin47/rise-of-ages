/**
 * Sound and music.
 *
 * Effects are Kenney's CC0 Interface Sounds, decoded once and played from a
 * buffer. Music has no sample behind it at all: Kenney publishes jingles but no
 * looping score, and rather than take on a track from somewhere with a
 * different licence, the music here is generated in WebAudio. That keeps it
 * original work under the project's own MIT licence, adds nothing to download,
 * and means the Music toggle controls something real rather than a stub.
 *
 * Everything is lazy. Browsers refuse to start audio before a user gesture, so
 * no AudioContext exists until the first click, and a page that is never
 * clicked never touches the audio hardware.
 */
import type { Settings } from './settings';

const BASE = `${import.meta.env.BASE_URL}kenney/audio/`;

export type SfxName = 'click' | 'select' | 'build' | 'deny' | 'raze' | 'age' | 'toggle';

const SFX: SfxName[] = ['click', 'select', 'build', 'deny', 'raze', 'age', 'toggle'];

let ctx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
const buffers = new Map<SfxName, AudioBuffer>();

let settings: Settings = { sound: true, music: false };
let musicTimer: number | null = null;

/**
 * Create the audio graph. Safe to call repeatedly; only the first call after a
 * real user gesture does anything.
 */
function ensureContext(): AudioContext | null {
  if (ctx) {
    // Browsers suspend the context when a tab is backgrounded, and Chrome
    // starts it suspended if it decides the gesture was not good enough.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  ctx = new Ctor();
  sfxGain = ctx.createGain();
  sfxGain.gain.value = settings.sound ? 0.55 : 0;
  sfxGain.connect(ctx.destination);

  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(ctx.destination);

  void loadAll();
  return ctx;
}

async function loadAll(): Promise<void> {
  await Promise.all(
    SFX.map(async (name) => {
      if (buffers.has(name)) return;
      try {
        const res = await fetch(`${BASE}${name}.ogg`);
        if (!res.ok) throw new Error(String(res.status));
        const bytes = await res.arrayBuffer();
        buffers.set(name, await ctx!.decodeAudioData(bytes));
      } catch {
        // A missing or undecodable sound must never break the game; the
        // effect simply does not play.
        console.warn(`sound failed to load: ${name}`);
      }
    }),
  );
}

/** Call from the first user gesture, and whenever settings change. */
export function unlockAudio(): void {
  ensureContext();
  applySettings(settings);
}

export function applySettings(next: Settings): void {
  settings = next;
  if (!ctx || !sfxGain || !musicGain) return;

  const now = ctx.currentTime;
  sfxGain.gain.setTargetAtTime(next.sound ? 0.55 : 0, now, 0.02);

  if (next.music) {
    musicGain.gain.setTargetAtTime(MUSIC_LEVEL, now, 0.6);
    startMusic();
  } else {
    // Fade out before stopping, so switching it off is not a click.
    musicGain.gain.setTargetAtTime(0, now, 0.4);
    stopMusic();
  }
}

export function playSfx(name: SfxName): void {
  if (!settings.sound) return;
  const c = ensureContext();
  const buf = buffers.get(name);
  if (!c || !sfxGain || !buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(sfxGain);
  src.start();
}

// ---------------------------------------------------------------- music --

const MUSIC_LEVEL = 0.16;

/**
 * A slow four-chord turn in A minor, with a pad holding the chord and the odd
 * pluck drifting over it. Pentatonic, so any note lands consonantly against any
 * chord and there is nothing to clash. It is written to sit under the game and
 * be ignorable rather than to be listened to.
 */
const CHORDS = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 246.94, 293.66], // G
  [261.63, 329.63, 392.0], // C
];
const PENTATONIC = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

const BAR = 7.5; // seconds a chord is held
let chordIndex = 0;
let nextBarAt = 0;

function voice(freq: number, at: number, dur: number, level: number, type: OscillatorType): void {
  if (!ctx || !musicGain) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = type;
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.Q.value = 0.4;

  // Long, soft envelopes: no attack transient means nothing ever jumps out.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + dur * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(musicGain);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Schedule the next chord slightly ahead of time, then sleep until near it. */
function scheduleBar(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (nextBarAt < now) nextBarAt = now + 0.1;

  const chord = CHORDS[chordIndex % CHORDS.length];
  chordIndex++;

  for (const f of chord) voice(f, nextBarAt, BAR * 0.98, 0.09, 'sine');

  // Two or three plucks per bar at unpredictable offsets, so the loop never
  // announces itself.
  const plucks = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < plucks; i++) {
    const at = nextBarAt + Math.random() * BAR * 0.85;
    const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    voice(f, at, 1.6, 0.05, 'triangle');
  }

  nextBarAt += BAR;
}

function startMusic(): void {
  if (musicTimer !== null || !ctx) return;
  nextBarAt = ctx.currentTime + 0.15;
  scheduleBar();
  musicTimer = window.setInterval(() => {
    if (!ctx) return;
    // Keep roughly one bar queued ahead; setInterval drifts and is throttled
    // in background tabs, so this tops up rather than assuming it fired on time.
    while (nextBarAt < ctx.currentTime + BAR) scheduleBar();
  }, 1000);
}

function stopMusic(): void {
  if (musicTimer === null) return;
  window.clearInterval(musicTimer);
  musicTimer = null;
}

/** Test hook: what the engine currently believes about itself. */
export function audioState(): Record<string, unknown> {
  return {
    context: ctx ? ctx.state : 'none',
    loaded: buffers.size,
    sound: settings.sound,
    music: settings.music,
    musicRunning: musicTimer !== null,
    sfxGain: sfxGain ? Number(sfxGain.gain.value.toFixed(3)) : null,
    musicGain: musicGain ? Number(musicGain.gain.value.toFixed(3)) : null,
  };
}
