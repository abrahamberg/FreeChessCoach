import type { ReactNode } from 'react';
import { IMPORT_INTENT_LABELS, IMPORT_INTENTS, type ImportIntent } from './import-intent.js';

export interface IntentButtonsProps {
  onChoose: (intent: ImportIntent) => void;
  disabled?: boolean;
  /** Appended to each accessible name so several rows' buttons stay distinct
   * ("Analyze daniel vs. Marta"). Omit where there is only one set. */
  subject?: string;
}

/** The two ways to import one game: Analyze (the free review) or Get coaching
 * session. Analyze is the quieter of the two, since coaching needs an AI key. */
export function IntentButtons({ onChoose, disabled = false, subject }: IntentButtonsProps): ReactNode {
  return (
    <div className="intent-buttons">
      {IMPORT_INTENTS.map((intent) => (
        <button
          key={intent}
          type="button"
          className={intent === 'coach' ? 'btn-primary' : 'btn-secondary'}
          disabled={disabled}
          aria-label={subject ? `${IMPORT_INTENT_LABELS[intent]}: ${subject}` : undefined}
          onClick={() => onChoose(intent)}
        >
          {IMPORT_INTENT_LABELS[intent]}
        </button>
      ))}
    </div>
  );
}
