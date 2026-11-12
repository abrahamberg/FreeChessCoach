import { useState, type ReactNode } from 'react';
import { readGameInput } from './game-input.js';
import { RecentGamesPicker } from './RecentGamesPicker.js';
import type { GameSite } from './recent-games.js';

type Source = 'pgn' | GameSite;

const SOURCES: { id: Source; label: string }[] = [
  { id: 'chesscom', label: 'Chess.com' },
  { id: 'lichess', label: 'Lichess' },
  { id: 'pgn', label: 'Paste a PGN' }
];

export interface GameChooserProps {
  onReview: (pgn: string, userColor: 'white' | 'black') => void;
}

/** Where the game comes from: a username on Chess.com or Lichess, or a pasted PGN. */
export function GameChooser({ onReview }: GameChooserProps): ReactNode {
  const [source, setSource] = useState<Source>('chesscom');
  return (
    <div className="free-review__chooser">
      <div className="free-review__sources" role="tablist" aria-label="Where is your game?">
        {SOURCES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={source === option.id}
            className={source === option.id ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setSource(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {source === 'pgn' ? <PgnForm onReview={onReview} /> : <RecentGamesPicker key={source} site={source} onReview={onReview} />}
    </div>
  );
}

function PgnForm({ onReview }: GameChooserProps): ReactNode {
  const [text, setText] = useState('');
  const [side, setSide] = useState<'white' | 'black'>('white');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const input = readGameInput(text);
    if (!input.ok) {
      setError(input.error);
      return;
    }
    setError(null);
    onReview(input.pgn, side);
  };

  return (
    <form
      className="free-review__form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="free-review-pgn" className="free-review__label">
        Your game (PGN)
      </label>
      <textarea id="free-review-pgn" className="free-review__pgn" rows={8} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
      <fieldset className="free-review__side">
        <legend>You played</legend>
        <label>
          <input type="radio" name="free-review-side" checked={side === 'white'} onChange={() => setSide('white')} /> White
        </label>
        <label>
          <input type="radio" name="free-review-side" checked={side === 'black'} onChange={() => setSide('black')} /> Black
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="free-review__error">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary">
        Review my game
      </button>
    </form>
  );
}
