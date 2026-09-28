import { readMoveSoundsEnabled } from './move-sounds-setting.js';
import type { BoardSound } from './move-sounds.js';
import { isVoiceSpeaking } from './voice-activity.js';

const SAMPLE_RATE = 44100;
/** A board sound while the coach's voice speaks. */
const DUCKED = 1 / 3;

/** Each sound's file in `public/sounds/` (made by
 * scripts/sounds/generate-board-sounds.py; see its README) and its level:
 * the opponent's knock softer than the learner's. */
const LAYERS: Record<BoardSound, { file: string; delayMs?: number; gain: number }[]> = {
  move: [{ file: 'move', gain: 1 }],
  opponent: [{ file: 'opponent', gain: 0.75 }],
  capture: [{ file: 'capture', gain: 1 }],
  check: [{ file: 'check', gain: 1 }],
  bad: [{ file: 'bad', gain: 0.9 }],
  great: [{ file: 'great', gain: 0.95 }]
};

/** How long each sound lasts, in seconds (the files' lengths), for a voice
 * that should wait for it and for clip timing. */
const SECONDS: Record<BoardSound, number> = { move: 0.16, opponent: 0.16, capture: 0.23, check: 0.15, bad: 0.04, great: 0.23 };

async function render(sound: BoardSound, files: Map<string, AudioBuffer>): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(1, Math.ceil(SAMPLE_RATE * SECONDS[sound]) + 1024, SAMPLE_RATE);
  for (const layer of LAYERS[sound]) {
    const source = context.createBufferSource();
    source.buffer = files.get(layer.file) ?? null;
    const level = context.createGain();
    level.gain.value = layer.gain;
    source.connect(level).connect(context.destination);
    source.start((layer.delayMs ?? 0) / 1000);
  }
  return context.startRendering();
}

let rendered: Promise<Record<BoardSound, AudioBuffer>> | null = null;

/** The six sounds, loaded and mixed once; also scheduled into clips. */
export function boardSoundBuffers(): Promise<Record<BoardSound, AudioBuffer>> {
  rendered ??= (async () => {
    const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    const names = [...new Set(Object.values(LAYERS).flatMap((layers) => layers.map((layer) => layer.file)))];
    const files = new Map(
      await Promise.all(
        names.map(async (name) => {
          const response = await fetch(`/sounds/${name}.wav`);
          if (!response.ok) throw new Error(`Board sound ${name} did not load`);
          return [name, await decoder.decodeAudioData(await response.arrayBuffer())] as const;
        })
      )
    );
    const sounds = await Promise.all((Object.keys(LAYERS) as BoardSound[]).map(async (sound) => [sound, await render(sound, files)] as const));
    return Object.fromEntries(sounds) as Record<BoardSound, AudioBuffer>;
  })();
  // A failed load (offline, blocked) may be tried again next time.
  rendered.catch(() => (rendered = null));
  return rendered;
}

const canPlay = typeof window !== 'undefined' && typeof AudioContext !== 'undefined' && typeof OfflineAudioContext !== 'undefined';
let live: AudioContext | null = null;

/** Plays a sound on the board: a third as loud while the coach speaks;
 * nothing when Settings > Board has move sounds off. */
export function playBoardSound(sound: BoardSound): void {
  play([[sound, 0]]);
}

function play(queue: [BoardSound, number][]): void {
  if (!canPlay || !readMoveSoundsEnabled()) return;
  live ??= new AudioContext();
  const context = live;
  void (async () => {
    if (context.state === 'suspended') await context.resume().catch(() => undefined);
    const buffers = await boardSoundBuffers();
    const level = context.createGain();
    level.gain.value = isVoiceSpeaking() ? DUCKED : 1;
    level.connect(context.destination);
    for (const [sound, delayMs] of queue) {
      const source = context.createBufferSource();
      source.buffer = buffers[sound];
      source.connect(level);
      source.start(context.currentTime + delayMs / 1000);
    }
  })().catch(() => undefined);
}

/** How long a sound lasts, for a voice that should wait for it. */
export function boardSoundLengthMs(sound: BoardSound): number {
  return SECONDS[sound] * 1000;
}
