import { useState, type ChangeEvent, type ReactNode } from 'react';
import type { ImportGameRequest } from '@freechesscoach/shared';
import { IntentButtons } from './IntentButtons.js';
import type { ImportIntent } from './import-intent.js';

export interface PgnUploadFormProps {
  onSubmit: (body: Pick<ImportGameRequest, 'pgn' | 'source'>, intent: ImportIntent) => void;
}

/** design.md §4.2: "Upload" segment of the import control — reads a .pgn
 * file's text, then waits for the reader to say what it is for (Analyze or
 * Get coaching session) before handing it to the caller. No fetching here
 * (ImportPage owns the mutation), matching PgnPasteForm's pattern. */
export function PgnUploadForm({ onSubmit }: PgnUploadFormProps): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [loadedPgn, setLoadedPgn] = useState<string | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoadedPgn(null);

    const reader = new FileReader();
    reader.onload = () => {
      const pgn = typeof reader.result === 'string' ? reader.result.trim() : '';
      if (!pgn) {
        setError('That file was empty.');
        return;
      }
      setLoadedPgn(pgn);
    };
    reader.onerror = () => setError('Could not read that file. Try again.');
    reader.readAsText(file);
  }

  return (
    <div className="pgn-upload-form">
      <label htmlFor="pgn-upload-input">PGN file</label>
      <input id="pgn-upload-input" type="file" accept=".pgn" onChange={handleChange} />
      {error && <p role="alert">{error}</p>}
      {loadedPgn !== null && <IntentButtons onChoose={(intent) => onSubmit({ pgn: loadedPgn, source: 'upload' }, intent)} />}
    </div>
  );
}
