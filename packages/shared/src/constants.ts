export const MISTAKE_CATEGORIES = [
  'hanging_piece',
  'missed_tactic',
  'allowed_tactic',
  'calculation_error',
  'premature_action',
  'passive_play',
  'pawn_structure',
  'king_safety',
  'piece_activity',
  'endgame_technique',
  'opening_knowledge',
  'no_plan',
  'time_management'
] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

export const RATING_BANDS = ['novice', 'improving', 'club', 'advanced'] as const;
export type RatingBand = (typeof RATING_BANDS)[number];

/**
 * 'chess_api' calls the free https://chess-api.com/v1 HTTP API from the
 * server — never exposed to the browser, so it's trusted the same as
 * 'native' for position_evaluations cache purposes (see
 * resolve-engine-backend.ts's isExternalSource). It's the default for new
 * users: it needs no shared local engine pool, so it sidesteps the
 * bot-vs-background-analysis contention 'native' can hit under load.
 * 'native' (the server's own Stockfish pool) and 'browser' (client-side WASM,
 * tunneled) remain available as alternatives.
 */
export const ENGINE_MODES = ['chess_api', 'native', 'browser'] as const;
export type EngineMode = (typeof ENGINE_MODES)[number];

/**
 * Cosmetic coach personalities (coaches.md). `general` and `general_female`
 * are both the coach as it has always existed — byte-identical prompts (see
 * packages/prompts/src/coach-persona.ts), differing only in which TTS voice
 * reads them aloud, so a student can pick the default coach's gender without
 * changing anything about how the coach teaches. Every other value changes
 * voice/tone too, but never chess judgment, method, or the rules the coach
 * follows.
 */
export const COACH_PERSONAS = [
  'general',
  'general_female',
  'commander',
  'scholar',
  'huntress',
  'shark',
  'sunzi',
  'gambler'
] as const;
export type CoachPersona = (typeof COACH_PERSONAS)[number];

export const COACH_PERSONA_INFO: Record<
  CoachPersona,
  { label: string; avatar: string; tagline: string; explicit: boolean; voiceProfile: string }
> = {
  general: {
    label: 'Coach',
    avatar: '♞',
    tagline: 'The coach as you know them today',
    explicit: false,
    voiceProfile: 'Male, 40s'
  },
  general_female: {
    label: 'Coach',
    avatar: '♞',
    tagline: 'The coach as you know them today',
    explicit: false,
    voiceProfile: 'Female, 40s'
  },
  commander: {
    label: 'The Commander',
    avatar: '🎖️',
    tagline: 'Direct, demanding, no excuses',
    explicit: false,
    voiceProfile: 'Male, 60s'
  },
  scholar: {
    label: 'The Scholar',
    avatar: '🎓',
    tagline: 'Patient, curious, explains the why',
    explicit: false,
    voiceProfile: 'Male, 70s'
  },
  huntress: {
    label: 'The Huntress',
    avatar: '🗡️',
    tagline: 'Sharp, relentless, attack-minded',
    explicit: false,
    voiceProfile: 'Female, 20s'
  },
  // coaches.md: unfiltered slang, trash talk, and profanity are part of the character.
  shark: {
    label: 'The Street Shark',
    avatar: '🦈',
    tagline: 'Loud, funny, thrives in chaos',
    explicit: true,
    voiceProfile: 'Male, 20s'
  },
  sunzi: {
    label: 'Art of the Board',
    avatar: '⚖️',
    tagline: 'Calm, strategic, aphoristic',
    explicit: false,
    voiceProfile: 'Male, 60s'
  },
  // coaches.md: profanity and insults are part of the character.
  gambler: {
    label: 'The Gambler',
    avatar: '🎲',
    tagline: 'Charismatic, fearless, roasts you',
    explicit: true,
    voiceProfile: 'Male, 40s'
  }
};

/**
 * Coach-voice (TTS) backend. 'openai' calls the cloud API (better quality
 * and latency, spends AI credits); 'browser' runs Kokoro WASM locally on the
 * user's device (free, but slow and depends on their machine). Master toggle
 * is `users.tts_enabled`, off by default; `ttsBackend` only matters once
 * that's on. SettingsPage confirms either choice with a dialog before saving.
 */
export const TTS_BACKENDS = ['openai', 'browser'] as const;
export type TtsBackend = (typeof TTS_BACKENDS)[number];

/**
 * Search depth every backend analyzes at by default. Lives here, in the one
 * package all three of them depend on, because `position_evaluations` is keyed
 * by `fen` alone: a row written by one backend is served to callers using the
 * other, so a depth that differs per backend silently mixes non-comparable
 * evaluations in a single cache. It previously did — services/engine defaulted
 * to 16 while the browser tunnel client hardcoded 15.
 */
export const ENGINE_DEFAULT_DEPTH = 16;

/**
 * Per-position allowance added to the tunnel timeout, for both a single
 * analyzePosition request and each position folded into a whole-game
 * analyzeGame batch. This isn't an average — it has to cover the *worst*
 * position, because `go depth 16` / multiPv 3 has no time bound at all: the
 * single-threaded full-net WASM build measured 9.9s-16.1s on ordinary early
 * Ruy Lopez positions (wide-open, nothing to prune, three full lines to
 * maintain), against sharper middlegame positions finishing in ~3-4s. Every
 * new game's first chunk is the opening, so an average-sized budget fails
 * almost every browser-mode import at the very first chunk. Product call:
 * browser-mode analysis is allowed to take minutes — correctness and
 * depth-16 parity with the native engine matter more than latency here.
 */
export const ENGINE_TUNNEL_PER_POSITION_MS = 30_000;
