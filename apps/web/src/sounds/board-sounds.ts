import { readMoveSoundsEnabled } from './move-sounds-setting.js';
import type { BoardSound, MoveSounds } from './move-sounds.js';
import { isVoiceSpeaking } from './voice-activity.js';

const SAMPLE_RATE = 44100;
/** Every sound is normalized to this peak, then set to its own level
 * (`VOICES[…].level`), so the opponent's knock stays softer than the
 * learner's and the stingers sit with the knocks. */
const PEAK = 0.8;
/** A board sound while the coach's voice speaks. */
const DUCKED = 1 / 3;
/** The stinger (bad, great) after the knock. */
export const STINGER_DELAY_MS = 120;

type Voice = (context: OfflineAudioContext, out: AudioNode) => void;

/** A short burst of noise through a band-pass: the click of a piece. */
function click(context: OfflineAudioContext, out: AudioNode, at: number, frequency: number, gain: number): void {
  const length = Math.floor(context.sampleRate * 0.03);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index++) data[index] = (Math.random() * 2 - 1) * Math.exp(-index / (length / 6));
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = 1.4;
  const level = context.createGain();
  level.gain.value = gain;
  source.connect(filter).connect(level).connect(out);
  source.start(at);
}

/** A tone with a quick attack and an exponential fall. */
function tone(context: OfflineAudioContext, out: AudioNode, options: { at: number; from: number; to?: number; length: number; type: OscillatorType; gain: number }): void {
  const { at, from, to = from, length, type, gain } = options;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(envelope).connect(out);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
}

/** A wooden knock: the click and a short hollow body. */
function knock(context: OfflineAudioContext, out: AudioNode, pitch: number, gain: number): void {
  click(context, out, 0, pitch * 8, gain);
  tone(context, out, { at: 0, from: pitch * 1.6, to: pitch, length: 0.09, type: 'sine', gain: gain * 0.9 });
  tone(context, out, { at: 0, from: pitch * 3.1, length: 0.04, type: 'triangle', gain: gain * 0.25 });
}

const VOICES: Record<BoardSound, { seconds: number; level: number; play: Voice }> = {
  move: { seconds: 0.18, level: 1, play: (context, out) => knock(context, out, 220, 1) },
  // Lower and softer: the other side's piece.
  opponent: { seconds: 0.18, level: 0.65, play: (context, out) => knock(context, out, 165, 0.75) },
  // The knock, then two rising notes.
  check: {
    seconds: 0.38,
    level: 0.9,
    play: (context, out) => {
      knock(context, out, 220, 0.8);
      tone(context, out, { at: 0.05, from: 880, length: 0.16, type: 'sine', gain: 0.45 });
      tone(context, out, { at: 0.14, from: 1175, length: 0.22, type: 'sine', gain: 0.4 });
    }
  },
  // A low fall, two tones a semitone apart.
  bad: {
    seconds: 0.4,
    level: 0.85,
    play: (context, out) => {
      tone(context, out, { at: 0, from: 233, to: 131, length: 0.36, type: 'triangle', gain: 0.6 });
      tone(context, out, { at: 0, from: 220, to: 123, length: 0.36, type: 'sine', gain: 0.5 });
    }
  },
  // A bright rise, the notes of a major chord.
  great: {
    seconds: 0.68,
    level: 0.6,
    play: (context, out) => {
      [659, 831, 988, 1319].forEach((frequency, index) =>
        tone(context, out, { at: index * 0.07, from: frequency, length: 0.45 - index * 0.05, type: 'triangle', gain: 0.35 })
      );
      tone(context, out, { at: 0.21, from: 2637, length: 0.4, type: 'sine', gain: 0.12 });
    }
  }
};

async function render(sound: BoardSound): Promise<AudioBuffer> {
  const { seconds, level, play } = VOICES[sound];
  const context = new OfflineAudioContext(1, Math.ceil(SAMPLE_RATE * seconds), SAMPLE_RATE);
  const out = context.createGain();
  out.connect(context.destination);
  play(context, out);
  const buffer = await context.startRendering();
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) for (let index = 0; index < data.length; index++) data[index] = (data[index]! / peak) * PEAK * level;
  return buffer;
}

let rendered: Promise<Record<BoardSound, AudioBuffer>> | null = null;

/** The five sounds, rendered once; also scheduled into clips. */
export function boardSoundBuffers(): Promise<Record<BoardSound, AudioBuffer>> {
  rendered ??= Promise.all((Object.keys(VOICES) as BoardSound[]).map(async (sound) => [sound, await render(sound)] as const)).then(
    (pairs) => Object.fromEntries(pairs) as Record<BoardSound, AudioBuffer>
  );
  return rendered;
}

const canPlay = typeof window !== 'undefined' && typeof AudioContext !== 'undefined' && typeof OfflineAudioContext !== 'undefined';
let live: AudioContext | null = null;

/** Plays a move's sounds on the board: the knock now, the stinger just
 * after; a third as loud while the coach speaks; nothing when Settings >
 * Board has move sounds off. */
export function playBoardSounds(sounds: MoveSounds): void {
  if (!canPlay || !readMoveSoundsEnabled()) return;
  live ??= new AudioContext();
  const context = live;
  void (async () => {
    if (context.state === 'suspended') await context.resume().catch(() => undefined);
    const buffers = await boardSoundBuffers();
    const level = context.createGain();
    level.gain.value = isVoiceSpeaking() ? DUCKED : 1;
    level.connect(context.destination);
    const start = (sound: BoardSound, delayMs: number): void => {
      const source = context.createBufferSource();
      source.buffer = buffers[sound];
      source.connect(level);
      source.start(context.currentTime + delayMs / 1000);
    };
    start(sounds.base, 0);
    if (sounds.stinger) start(sounds.stinger, STINGER_DELAY_MS);
  })().catch(() => undefined);
}

/** How long a move's sounds last, for a voice that should wait for them. */
export function boardSoundsLengthMs(sounds: MoveSounds): number {
  const base = VOICES[sounds.base].seconds * 1000;
  return sounds.stinger ? Math.max(base, STINGER_DELAY_MS + VOICES[sounds.stinger].seconds * 1000) : base;
}
