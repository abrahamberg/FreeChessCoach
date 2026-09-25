import { useEffect, useState, type ReactNode } from 'react';
import { useKickoffFacts } from './kickoff-facts-context.js';
import { KickoffProgress } from './KickoffProgress.js';

export interface ThinkingIndicatorProps {
  visible: boolean;
  /** Overrides the default "the coach is thinking" label — e.g. "Studying
   * your game…" for a session's kickoff turn, whose first token can take
   * much longer than an ordinary reply (useCoachChat's `thinkingLabel`). */
  label?: string | null;
}

const APPEAR_DELAY_MS = 300;
const DEFAULT_LABEL = 'the coach is thinking';

/** design.md §5.7: a 3-dot typing indicator in a coach bubble, appearing
 * after a 300ms delay so a fast reply never flickers it on and off. */
export function ThinkingIndicator({ visible, label }: ThinkingIndicatorProps): ReactNode {
  const [shown, setShown] = useState(false);
  const kickoffFacts = useKickoffFacts();

  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }
    const timeout = setTimeout(() => setShown(true), APPEAR_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [visible]);

  if (!shown) return null;
  // Only the kickoff turn carries a label; on a session page it also has
  // facts about the game to walk through while that long first reply is
  // prepared.
  if (label && kickoffFacts.length > 0) return <KickoffProgress facts={kickoffFacts} label={label} />;

  return (
    <p className="thinking-indicator" aria-label={label ?? DEFAULT_LABEL} role="status">
      {label && <span className="thinking-indicator__label">{label}</span>}
      <span className="thinking-indicator__dots">
        <span />
        <span />
        <span />
      </span>
    </p>
  );
}
