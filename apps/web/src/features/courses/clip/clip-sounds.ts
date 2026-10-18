import type { CoachPersona } from '@freechesscoach/shared';
import { boardSoundBuffers, boardSoundLengthMs } from '../../../sounds/board-sounds.js';
import type { BoardSound } from '../../../sounds/move-sounds.js';

/** docs/courses.md §13.8: the board sounds, plus the videos' cut sounds
 * (scripts/sounds/generate-clip-sounds.py; `wand` is the first second of a
 * sound the owner chose, apps/web/public/sounds/README.md). */
export type ClipSound = BoardSound | 'riser' | 'whoosh' | 'wand';

const CUT_SOUNDS = { riser: 5000, whoosh: 450, wand: 1000 } as const;

/** A coach's own sound for a cut, in place of the whoosh (the owner,
 * 2026-10-18: Vesper's wand first; the other coaches to follow). */
const COACH_CUTS: Partial<Record<CoachPersona, ClipSound>> = { witch: 'wand' };

/** The sound of a cut (a chapter card, a jump back) in `persona`'s video. */
export function cutSoundOf(persona: CoachPersona): ClipSound {
  return COACH_CUTS[persona] ?? 'whoosh';
}

/** How long a sound lasts, in ms: a voice waits for a board sound. */
export function clipSoundLengthMs(sound: ClipSound): number {
  return sound in CUT_SOUNDS ? CUT_SOUNDS[sound as keyof typeof CUT_SOUNDS] : boardSoundLengthMs(sound as BoardSound);
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
