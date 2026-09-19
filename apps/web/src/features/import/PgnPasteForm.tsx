import { useState, type FormEvent, type ReactNode } from 'react';
import type { ImportGameRequest } from '@freechesscoach/shared';
import { IntentButtons } from './IntentButtons.js';
import type { ImportIntent } from './import-intent.js';

export interface PgnPasteFormProps {
  onSubmit: (body: ImportGameRequest, intent: ImportIntent) => void;
}

/** Pure form: builds an ImportGameRequestSchema-shaped body and hands it to
 * the caller with what it is for (Analyze or Get coaching session). No
 * fetching here — ImportPage owns the mutation. */
export function PgnPasteForm({ onSubmit }: PgnPasteFormProps): ReactNode {
  const [pgn, setPgn] = useState('');

  function submit(intent: ImportIntent): void {
    const trimmed = pgn.trim();
    if (!trimmed) return;
    onSubmit({ pgn: trimmed, source: 'paste' }, intent);
  }

  return (
    <form className="pgn-paste-form" onSubmit={(event: FormEvent) => event.preventDefault()}>
      <label htmlFor="pgn-paste-input">PGN</label>
      <textarea
        id="pgn-paste-input"
        value={pgn}
        onChange={(event) => setPgn(event.target.value)}
        rows={10}
      />
      <IntentButtons onChoose={submit} />
    </form>
  );
}
