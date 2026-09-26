import type { ReactNode } from 'react';
import { arrowLabel } from './arrowToken.js';

export interface ArrowTokenProps {
  from: string;
  to: string;
  san?: string;
}

/** Read-only rendering of an inline `[from-to]` arrow reference inside a
 * sent message — the transcript twin of the composer's editable ArrowChip. */
export function ArrowToken({ from, to, san }: ArrowTokenProps): ReactNode {
  return (
    <span className="arrow-token">
      <code className="san">{arrowLabel({ from, to, san })}</code>
    </span>
  );
}
