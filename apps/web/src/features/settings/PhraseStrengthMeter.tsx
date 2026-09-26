import type { ReactNode } from 'react';
import type { UnlockPhraseStrength } from './useUnlockPhraseStrength.js';

const LEVELS = ['Very easy to guess', 'Easy to guess', 'Still guessable', 'Strong', 'Very strong'] as const;

/** A four-bar meter under a new-phrase field with a plain verdict, and the
 * reason when the phrase is refused — red while it would be refused, green
 * once it passes. */
export function PhraseStrengthMeter({ strength }: { strength: UnlockPhraseStrength }): ReactNode {
  const { verdict, checking } = strength;
  const tone = checking || !verdict ? 'pending' : verdict.ok ? 'ok' : 'weak';
  const filled = verdict ? Math.max(1, verdict.score) : 0;
  return (
    <div className={`phrase-meter phrase-meter--${tone}`} aria-live="polite">
      <div className="phrase-meter__bars" aria-hidden="true">
        {[1, 2, 3, 4].map((bar) => (
          <span key={bar} className={`phrase-meter__bar ${bar <= filled ? 'is-filled' : ''}`} />
        ))}
      </div>
      <p className="phrase-meter__label">
        {checking ? 'Checking how guessable it is…' : verdict ? <strong>{verdict.ok ? `✓ ${LEVELS[verdict.score]}` : `✗ ${LEVELS[verdict.score]} — can't be used`}</strong> : 'At least 8 characters.'}
      </p>
      {verdict && !verdict.ok && <p className="phrase-meter__reason">{verdict.problem}</p>}
      {!verdict && !checking && (
        <p className="phrase-meter__reason">Use three or four unrelated words — not a common password, a keyboard run or your name.</p>
      )}
    </div>
  );
}
