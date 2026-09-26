import type { ZxcvbnFactory } from '@zxcvbn-ts/core';

/** zxcvbn score (0–4) a new unlock phrase must reach: 3 is "safely
 * unguessable" — roughly 10^8+ guesses even for an attacker who tries leaked
 * password lists, dictionary words, l33t swaps and keyboard runs first. */
export const MIN_UNLOCK_PHRASE_SCORE = 3;

/** Words this site's users are likely to build a phrase from; zxcvbn treats
 * them like dictionary words. */
const SITE_WORDS = ['chess', 'coach', 'freechesscoach', 'unlock', 'phrase', 'openai', 'anthropic', 'openrouter', 'claude', 'stockfish'];

export interface UnlockPhraseVerdict {
  ok: boolean;
  score: number;
  /** Why it was refused, in words for the user; null when ok. */
  problem: string | null;
}

let checker: Promise<ZxcvbnFactory> | undefined;

/** Loaded on first use: the dictionaries are a few MB, so the web app gets
 * them as a separate chunk only when someone sets a phrase. */
function loadChecker(): Promise<ZxcvbnFactory> {
  checker ??= Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common'), import('@zxcvbn-ts/language-en')]).then(
    ([core, common, en]) =>
      new core.ZxcvbnFactory({
        graphs: common.adjacencyGraphs,
        dictionary: { ...common.dictionary, ...en.dictionary },
        translations: en.translations,
        // Catches near-misses of common passwords ("opensesemi").
        useLevenshteinDistance: true
      })
  );
  return checker;
}

/** Judges a new unlock phrase. `userInputs` (name, email, …) count as
 * guessable words too. Only new phrases are judged: an existing one always
 * unlocks. */
export async function checkUnlockPhrase(phrase: string, userInputs: readonly string[] = []): Promise<UnlockPhraseVerdict> {
  const result = await (await loadChecker()).check(phrase.trim(), [...SITE_WORDS, ...userInputs.filter(Boolean)]);
  if (result.score >= MIN_UNLOCK_PHRASE_SCORE) return { ok: true, score: result.score, problem: null };
  const why = result.feedback.warning ?? 'This phrase is too easy to guess.';
  return { ok: false, score: result.score, problem: `${why} Try three or four unrelated words, like "lamp river velvet 42".` };
}
