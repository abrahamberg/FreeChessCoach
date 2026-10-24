import type { ReactNode } from 'react';
import { useState } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { LiveReviewView } from './LiveReviewView.js';
import { readReviewInput, type ReviewInput } from './review-input.js';
import './AnalyzePage.css';

type Opened = Extract<ReviewInput, { ok: true }>['tree'];

/** A temporary review of any position or game: paste a FEN or a PGN (or open
 * the standard start), move the pieces, and the engine reviews every move as
 * it goes (LiveReviewView). It is for other people's games and ideas you do
 * not want in your stats, so it saves nothing: no game, no stats, no
 * coaching session, and leaving the page drops it. */
export function AnalyzePage(): ReactNode {
  const isDesktop = useIsDesktop();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ tree: Opened; orientation: 'white' | 'black' } | null>(null);

  const open = (): void => {
    const input = readReviewInput(text);
    if (!input.ok) {
      setError(input.error);
      return;
    }
    setError(null);
    setOpened({ tree: input.tree, orientation: input.tree.startFen.split(' ')[1] === 'b' ? 'black' : 'white' });
  };

  if (opened) {
    return (
      <LiveReviewView base={opened.tree} orientation={opened.orientation} isDesktop={isDesktop} onBack={() => setOpened(null)} />
    );
  }

  return (
    <div className="page analyze-page">
      <h1>Temporary review</h1>
      <p>
        Paste a game (PGN) or a position (FEN), or leave it empty for the starting position. Move the pieces and the engine reviews each move as you go.
        Nothing is saved, and none of it counts toward your stats.
      </p>
      <label htmlFor="analyze-input" className="analyze-page__label">
        PGN or FEN
      </label>
      <textarea id="analyze-input" className="analyze-page__input" rows={8} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
      {error && (
        <p role="alert" className="analyze-page__error">
          {error}
        </p>
      )}
      <button type="button" className="btn-primary" onClick={open}>
        Start review
      </button>
    </div>
  );
}
