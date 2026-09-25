import type { ReactNode } from 'react';
import { MessageCircleIcon, SearchIcon } from '../../components/Icon.js';
import { IMPORT_INTENT_LABELS, IMPORT_INTENTS, type ImportIntent } from './import-intent.js';

const INTENT_ICONS = { review: SearchIcon, coach: MessageCircleIcon } as const;

export interface IntentButtonsProps {
  onChoose: (intent: ImportIntent) => void;
  disabled?: boolean;
  /** Appended to each accessible name so several rows' buttons stay distinct
   * ("Analyze daniel vs. Marta"). Omit where there is only one set. */
  subject?: string;
}

/** The two ways to import one game: Analyze (the free review) or Get coaching
 * session — icon-only, the label is the tooltip. Analyze is the quieter of the two, since coaching needs an AI key. */
export function IntentButtons({ onChoose, disabled = false, subject }: IntentButtonsProps): ReactNode {
  return (
    <div className="intent-buttons">
      {IMPORT_INTENTS.map((intent) => {
        const Icon = INTENT_ICONS[intent];
        return (
          <button
            key={intent}
            type="button"
            className={intent === 'coach' ? 'btn-primary' : 'btn-secondary'}
            disabled={disabled}
            title={IMPORT_INTENT_LABELS[intent]}
            aria-label={subject ? `${IMPORT_INTENT_LABELS[intent]}: ${subject}` : IMPORT_INTENT_LABELS[intent]}
            onClick={() => onChoose(intent)}
          >
            <Icon width={20} height={20} />
          </button>
        );
      })}
    </div>
  );
}
