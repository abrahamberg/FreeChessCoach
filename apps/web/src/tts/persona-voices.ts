import { PERSONA_SPEECH_SPEED, type CoachPersona, type TtsBackend } from '@freechesscoach/shared';
import type { KokoroTTS } from 'kokoro-js';

/** Kokoro-js has no named export for its voice-id union — `voices` is a
 * getter on the model instance, so its keys are pulled from there instead
 * of hand-duplicating the list. */
export type KokoroVoiceId = keyof KokoroTTS['voices'];

export interface KokoroPersonaVoice {
  voice: KokoroVoiceId;
  /** Kokoro takes no delivery direction, so pace is the only other lever:
   * older, calmer coaches speak slower, the young ones faster. */
  speed: number;
  /** Kokoro has no pitch control either, so a voice that's too high is
   * played back at this rate without preserving pitch (below 1 = deeper).
   * That also slows it, so synthesis runs `speed / pitch` fast and the
   * heard pace stays `speed`. Kept mild: beyond ~0.8 or ~1.15 it sounds like tape. */
  pitch?: number;
}

/** Matched to each persona's gender/age voice profile (COACH_PERSONA_INFO —
 * see coaches.md), using a built-in Kokoro voice's timbre (af_/am_ =
 * American female/male, bf_/bm_ = British female/male). Everyone is
 * American except the two old-world characters, the Scholar and Art of the
 * Board, who get the deepest, most mature British voices (bm_lewis,
 * bm_george); bm_fable reads as a young man, so it voices no one. */
export const PERSONA_VOICES: Record<CoachPersona, KokoroPersonaVoice> = {
  general: { voice: 'am_michael', speed: PERSONA_SPEECH_SPEED.general },
  general_female: { voice: 'af_heart', speed: PERSONA_SPEECH_SPEED.general_female },
  commander: { voice: 'am_onyx', speed: PERSONA_SPEECH_SPEED.commander },
  scholar: { voice: 'bm_lewis', speed: PERSONA_SPEECH_SPEED.scholar },
  huntress: { voice: 'af_bella', speed: PERSONA_SPEECH_SPEED.huntress },
  shark: { voice: 'am_puck', speed: PERSONA_SPEECH_SPEED.shark },
  sunzi: { voice: 'bm_george', speed: PERSONA_SPEECH_SPEED.sunzi },
  gambler: { voice: 'am_fenrir', speed: PERSONA_SPEECH_SPEED.gambler, pitch: 0.9 }
};

/** The speed to ask Kokoro for, compensating for `pitch` (see above). */
export function kokoroSynthesisSpeed(persona: CoachPersona): { voice: KokoroVoiceId; speed: number } {
  const { voice, speed, pitch = 1 } = PERSONA_VOICES[persona];
  return { voice, speed: speed / pitch };
}

/** The same playback pitch shift for OpenAI voices, where asking for a
 * higher or lower voice in the instructions proved unreliable (the same
 * direction measured 200 Hz on one call, 162 Hz on the next). The server
 * compensates the tempo change with its `speed` (apps/api services/tts.ts). */
const OPENAI_PLAYBACK_PITCH: Partial<Record<CoachPersona, number>> = {
  scholar: 0.8,
  shark: 1.15,
  gambler: 0.92
};

/** Playback rate for a persona's audio on a given backend. The device voice
 * plays itself, so it's never shifted. */
export function personaPlaybackRate(persona: CoachPersona, backend: TtsBackend): number {
  if (backend === 'browser' || backend === 'local') return PERSONA_VOICES[persona].pitch ?? 1;
  if (backend === 'openai') return OPENAI_PLAYBACK_PITCH[persona] ?? 1;
  return 1;
}

/** Call after setting `src` — loading a new source resets the rate. */
export function applyPlaybackRate(audio: HTMLAudioElement, rate: number): void {
  audio.preservesPitch = rate === 1;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
}
