import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import type { ImportGameRequest } from '@freechesscoach/shared';
import { CloseIcon, ImportIcon } from '../../components/Icon.js';
import { IntentButtons } from './IntentButtons.js';
import type { ImportIntent } from './import-intent.js';
import { readPgnFile, type LoadedPgn } from './readPgnFile.js';

export interface PgnFileFormProps {
  onSubmit: (body: Pick<ImportGameRequest, 'pgn' | 'source'>, intent: ImportIntent) => void;
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** design.md §4.2: "From file" segment of the import control — a drop zone that
 * reads a .pgn file's text in the browser (see readPgnFile), shows what it
 * found, then waits for the reader to say what it is for (Analyze or Get
 * coaching session). Only the text is ever sent; the file itself never leaves the device.
 * No fetching here (ImportPage owns the mutation), like PgnPasteForm. */
export function PgnFileForm({ onSubmit }: PgnFileFormProps): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedPgn | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    setLoaded(null);
    try {
      setLoaded(await readPgnFile(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that file.');
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    void load(event.target.files?.[0]);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(false);
    void load(event.dataTransfer.files[0]);
  }

  function clear(): void {
    setLoaded(null);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="pgn-file-form">
      {loaded === null ? (
        <label
          className={isDragging ? 'pgn-dropzone pgn-dropzone--active' : 'pgn-dropzone'}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <span className="pgn-dropzone__icon" aria-hidden="true">
            <ImportIcon width={28} height={28} />
          </span>
          <span className="pgn-dropzone__title">Drop a .pgn file here</span>
          <span className="pgn-dropzone__hint">or click to choose one</span>
          <input ref={inputRef} type="file" accept=".pgn" onChange={handleChange} />
        </label>
      ) : (
        <div className="pgn-loaded">
          <div className="pgn-loaded__info">
            <strong>
              {loaded.whiteName} vs. {loaded.blackName}
            </strong>
            <span>
              {loaded.result} · {loaded.moves} moves · {loaded.fileName} ({formatSize(loaded.sizeBytes)})
            </span>
          </div>
          <button
            type="button"
            className="pgn-loaded__remove"
            title="Choose a different file"
            aria-label="Choose a different file"
            onClick={clear}
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="pgn-file-form__privacy">
        Only .pgn text files. The file stays on your device — only the game text is read and sent. If it
        holds several games, only the first is imported.
      </p>
      {loaded !== null && (
        <IntentButtons onChoose={(intent) => onSubmit({ pgn: loaded.pgn, source: 'file' }, intent)} />
      )}
    </div>
  );
}
