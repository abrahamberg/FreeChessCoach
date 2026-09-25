import type { CoachPersona } from '@freechesscoach/shared';

type Gender = 'male' | 'female';

export interface NativePersonaVoice {
  gender: Gender;
  /** Preferred accent: the Scholar and Art of the Board are British, the
   * rest American (same split as the Kokoro voices in persona-voices.ts). */
  lang: 'en-US' | 'en-GB';
  /** SpeechSynthesisUtterance.rate: 1 = normal. */
  rate: number;
  /** SpeechSynthesisUtterance.pitch: 1 = normal, 0–2. Some voices ignore it. */
  pitch: number;
}

/** The device voice can't be directed like OpenAI or swapped per timbre like
 * Kokoro; gender, accent, rate and pitch are all it takes. Age mostly comes
 * from pitch and pace: older coaches lower and slower, younger ones higher
 * and faster. */
export const NATIVE_PERSONA_VOICES: Record<CoachPersona, NativePersonaVoice> = {
  general: { gender: 'male', lang: 'en-US', rate: 1, pitch: 1 },
  general_female: { gender: 'female', lang: 'en-US', rate: 1, pitch: 1 },
  commander: { gender: 'male', lang: 'en-US', rate: 1.25, pitch: 0.8 },
  scholar: { gender: 'male', lang: 'en-GB', rate: 0.9, pitch: 0.8 },
  huntress: { gender: 'female', lang: 'en-US', rate: 1.1, pitch: 1.1 },
  shark: { gender: 'male', lang: 'en-US', rate: 1.2, pitch: 1.15 },
  sunzi: { gender: 'male', lang: 'en-GB', rate: 0.85, pitch: 0.8 },
  gambler: { gender: 'male', lang: 'en-US', rate: 1, pitch: 0.85 }
};

/** Web Speech voices carry no gender, only a name, so gender is read off
 * the names the major platforms ship (macOS/iOS, Windows, Chrome's Google
 * voices, Edge's online voices). A voice matching neither list is unknown. */
const FEMALE_NAMES =
  /\b(female|woman|samantha|victoria|karen|moira|tessa|fiona|serena|allison|ava|susan|zira|hazel|jenny|aria|libby|sonia|emma|michelle|catherine|kate|kathy|nicky|joanna|salli|kimberly|ivy|amy|olivia|zoe|ana|jane|nancy|sara|google us english)\b/i;
const MALE_NAMES =
  /\b(male|man|daniel|alex|fred|tom|oliver|arthur|rishi|aaron|david|mark|george|james|guy|ryan|eric|christopher|roger|steffan|brian|matthew|justin|joey|gordon|lee|evan|nathan|thomas|william|andrew|brandon|davis|jason|tony)\b/i;

function genderOf(voice: SpeechSynthesisVoice): Gender | null {
  // "Female" before "male": the male pattern's \bmale\b can't match inside
  // "female", but a name like "Google UK English Female" must still win.
  if (FEMALE_NAMES.test(voice.name)) return 'female';
  if (MALE_NAMES.test(voice.name)) return 'male';
  return null;
}

function langScore(voice: SpeechSynthesisVoice, lang: string): number {
  const voiceLang = voice.lang.replace('_', '-').toLowerCase();
  if (voiceLang === lang.toLowerCase()) return 2;
  return voiceLang.startsWith('en') ? 1 : 0;
}

export interface NativeVoiceChoice {
  /** Null when the device lists no English voice: its default is used. */
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
}

/** Picks the best English voice for a persona: right gender first, then
 * right accent, then a local (on-device) voice. When no voice's gender can
 * be told (Android names its voices "English United States"), pitch alone
 * leans the default voice toward the persona's gender. */
export function chooseNativeVoice(persona: CoachPersona, voices: readonly SpeechSynthesisVoice[]): NativeVoiceChoice {
  const wanted = NATIVE_PERSONA_VOICES[persona];
  const english = voices.filter((voice) => langScore(voice, wanted.lang) > 0);
  const ranked = english
    .map((voice) => ({
      voice,
      score: (genderOf(voice) === wanted.gender ? 10 : 0) + langScore(voice, wanted.lang) * 2 + (voice.localService ? 1 : 0)
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const genderMatched = best !== undefined && genderOf(best.voice) === wanted.gender;
  const pitchLean = genderMatched ? 1 : wanted.gender === 'male' ? 0.8 : 1.15;
  return {
    voice: best?.voice ?? null,
    rate: wanted.rate,
    pitch: Math.min(2, Math.max(0, wanted.pitch * pitchLean))
  };
}
