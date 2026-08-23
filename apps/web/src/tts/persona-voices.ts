import type { CoachPersona } from '@freechesscoach/shared';
import type { KokoroTTS } from 'kokoro-js';

/** Kokoro-js has no named export for its voice-id union — `voices` is a
 * getter on the model instance, so its keys are pulled from there instead
 * of hand-duplicating the list. */
export type KokoroVoiceId = keyof KokoroTTS['voices'];

/** Matched to each persona's gender/age voice profile (COACH_PERSONA_INFO —
 * see coaches.md), using a built-in Kokoro voice's "vibe" (af_/am_ =
 * American female/male, bf_/bm_ = British female/male). `general` uses
 * `bm_daniel` — named for "General Daniel," the coach this persona has
 * always been; `general_female` reuses the original `af_heart` pick (the
 * app's very first coach voice) as its counterpart — same coach, same
 * prompt, only the voice differs. */
export const PERSONA_VOICES: Record<CoachPersona, KokoroVoiceId> = {
  general: 'bm_daniel',
  general_female: 'af_heart',
  commander: 'am_onyx',
  scholar: 'bm_fable',
  huntress: 'bf_isabella',
  shark: 'am_puck',
  sunzi: 'bm_george',
  gambler: 'am_echo'
};
