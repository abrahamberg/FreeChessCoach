import type { CoachPersona } from '@chess-coach/shared';
import type { KokoroTTS } from 'kokoro-js';

/** Kokoro-js has no named export for its voice-id union — `voices` is a
 * getter on the model instance, so its keys are pulled from there instead
 * of hand-duplicating the list. */
export type KokoroVoiceId = keyof KokoroTTS['voices'];

/** coaches.md voice guidance, matched to a built-in Kokoro voice's "vibe"
 * (af_/am_ = American female/male, bf_/bm_ = British female/male). Confirmed
 * with the user before implementation — see the plan file. */
export const PERSONA_VOICES: Record<CoachPersona, KokoroVoiceId> = {
  general: 'af_heart',
  commander: 'am_onyx',
  scholar: 'bm_fable',
  huntress: 'bf_isabella',
  shark: 'am_puck',
  sunzi: 'bm_george',
  gambler: 'am_echo'
};
