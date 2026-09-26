import { checkUnlockPhrase, type UnlockPhraseVerdict } from '@freechesscoach/shared';
import { useEffect, useState } from 'react';
import { useDebounced } from './useLocalModels.js';

const DEBOUNCE_MS = 400;
const MIN_LENGTH = 8;

export interface UnlockPhraseStrength {
  /** Null until a long-enough phrase has been judged. */
  verdict: UnlockPhraseVerdict | null;
  checking: boolean;
}

/** Judges a new unlock phrase as it's typed, with the same check the server
 * enforces (minus the user's own name/email, which only the server adds).
 * Plain state, not a query: phrases shouldn't sit in a shared cache. */
export function useUnlockPhraseStrength(phrase: string): UnlockPhraseStrength {
  const debounced = useDebounced(phrase, DEBOUNCE_MS);
  const [judged, setJudged] = useState<{ phrase: string; verdict: UnlockPhraseVerdict } | null>(null);

  useEffect(() => {
    if (debounced.trim().length < MIN_LENGTH) return;
    let cancelled = false;
    void checkUnlockPhrase(debounced).then((verdict) => {
      if (!cancelled) setJudged({ phrase: debounced, verdict });
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  if (phrase.trim().length < MIN_LENGTH) return { verdict: null, checking: false };
  const current = judged?.phrase === phrase ? judged.verdict : null;
  return { verdict: current, checking: current === null };
}
