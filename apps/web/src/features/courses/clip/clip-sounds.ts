import { boardSoundBuffers, boardSoundLengthMs } from '../../../sounds/board-sounds.js';
import type { BoardSound } from '../../../sounds/move-sounds.js';

/** docs/courses.md §13.8: the board sounds, plus the videos' two cut sounds
 * (scripts/sounds/generate-clip-sounds.py). */
export type ClipSound = BoardSound | 'riser' | 'whoosh';

const CUT_SOUNDS = { riser: 5000, whoosh: 450 } as const;

/** How long a sound lasts, in ms: a voice waits for a board sound. */
export function clipSoundLengthMs(sound: ClipSound): number {
  return sound === 'riser' || sound === 'whoosh' ? CUT_SOUNDS[sound] : boardSoundLengthMs(sound);
}

let loaded: Promise<Record<ClipSound, AudioBuffer>> | null = null;

/** Every sound a video can schedule, loaded once. */
export function clipSoundBuffers(): Promise<Record<ClipSound, AudioBuffer>> {
  loaded ??= (async () => {
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const cuts = await Promise.all(
      (Object.keys(CUT_SOUNDS) as (keyof typeof CUT_SOUNDS)[]).map(async (name) => {
        const response = await fetch(`/sounds/${name}.wav`);
        if (!response.ok) throw new Error(`Clip sound ${name} did not load`);
        return [name, await decoder.decodeAudioData(await response.arrayBuffer())] as const;
      })
    );
    return { ...(await boardSoundBuffers()), ...Object.fromEntries(cuts) } as Record<ClipSound, AudioBuffer>;
  })();
  loaded.catch(() => (loaded = null));
  return loaded;
}
