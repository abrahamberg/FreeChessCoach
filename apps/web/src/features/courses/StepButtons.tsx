import type { ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/Icon.js';

export interface StepButtonsProps {
  className: string;
  /** "move" → "Previous move", "Next move". */
  noun: string;
  /** Where the selection stands; -1 when nothing is selected. */
  index: number;
  count: number;
  onStep: (offset: number) => void;
  /** ← and → do the same: said in the buttons' titles. */
  arrowKeys?: boolean;
  /** Between the two buttons, such as "Move 2 of 7". */
  children?: ReactNode;
}

/** The previous and next chevrons, under the board and over the episode. */
export function StepButtons({ className, noun, index, count, onStep, arrowKeys, children }: StepButtonsProps): ReactNode {
  return (
    <div className={`step-buttons ${className}`} role="group" aria-label={`${noun[0]?.toUpperCase()}${noun.slice(1)}s`}>
      <button type="button" className="btn-secondary" aria-label={`Previous ${noun}`} title={`Previous ${noun}${arrowKeys ? ' (←)' : ''}`} disabled={index <= 0} onClick={() => onStep(-1)}>
        <ChevronLeftIcon width={16} height={16} />
      </button>
      {children}
      <button type="button" className="btn-secondary" aria-label={`Next ${noun}`} title={`Next ${noun}${arrowKeys ? ' (→)' : ''}`} disabled={index < 0 || index >= count - 1} onClick={() => onStep(1)}>
        <ChevronRightIcon width={16} height={16} />
      </button>
    </div>
  );
}
