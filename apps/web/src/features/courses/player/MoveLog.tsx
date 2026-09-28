import type { ReactNode } from 'react';

export interface MoveLogEntry {
  /** "6.Bc3" or "6…Bb4". */
  label: string;
  side: 'white' | 'black';
  /** "You", "Opponent", or the side's name when the learner plays both. */
  who: string;
  /** The course's note on the move, when there is one. */
  note: string | null;
}

export interface MoveLogProps {
  /** The last moves played, oldest first (at most two are shown). */
  played: MoveLogEntry[];
  /** The move to play now; `label` null keeps it hidden (the drill). */
  current: { side: 'white' | 'black'; who: string; label: string | null };
}

/** docs/courses.md §11: while the learner plays, the last moves and the one
 * they are to find, each with a pawn in its side's colour. */
export function MoveLog({ played, current }: MoveLogProps): ReactNode {
  return (
    <ol className="move-log" aria-label="Last moves">
      {played.slice(-2).map((entry, index) => (
        <li key={index} className="move-log__row">
          <Pawn side={entry.side} />
          <div className="move-log__text">
            <span className="move-log__who">{entry.who}</span> <span className="move-log__move">{entry.label}</span>
            {entry.note && <p className="move-log__note">{entry.note}</p>}
          </div>
        </li>
      ))}
      <li className="move-log__row move-log__row--current" aria-current="step">
        <Pawn side={current.side} />
        <div className="move-log__text">
          <span className="move-log__who">{current.who}</span>{' '}
          {current.label ? <span className="move-log__move">{current.label}</span> : <span className="move-log__mask" aria-label="Your move, hidden">?</span>}
          <span className="move-log__hint"> · your move</span>
        </div>
      </li>
    </ol>
  );
}

function Pawn({ side }: { side: 'white' | 'black' }): ReactNode {
  return (
    <span className={`move-log__pawn move-log__pawn--${side}`} role="img" aria-label={side === 'white' ? 'White' : 'Black'}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 3a3 3 0 0 0-1.8 5.4C8.9 9.1 8.5 10.3 8.5 11.5h1.7c-.3 2.4-1.5 4.3-3 5.5V19h9.6v-2c-1.5-1.2-2.7-3.1-3-5.5h1.7c0-1.2-.4-2.4-1.7-3.1A3 3 0 0 0 12 3Z" />
        <rect x="5.5" y="19" width="13" height="2.5" rx="1" />
      </svg>
    </span>
  );
}
