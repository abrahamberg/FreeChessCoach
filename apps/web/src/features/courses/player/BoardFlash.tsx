import { useEffect, useState, type ReactNode } from 'react';
import { CheckIcon, CloseIcon } from '../../../components/Icon.js';

/** How long the success mark and a line's name stay on the board. */
export const SUCCESS_FLASH_MS = 1000;
export const LINE_FLASH_MS = 1000;

/** What shows over the board: the success or wrong mark, or the name of the line starting. */
export type BoardFlashContent = { kind: 'success' } | { kind: 'wrong' } | { kind: 'line'; title: string };

/** A short message over the board that clears itself. It takes no clicks, and
 * the board keeps its place: the parent decides what waits for it. Give the
 * host (`course-board-host`) as its parent. */
export function BoardFlash({ content, ms, onDone }: { content: BoardFlashContent; ms: number; onDone?: () => void }): ReactNode {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShown(false);
      onDone?.();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  if (!shown) return null;
  return (
    <div className="board-flash">
      {content.kind === 'success' ? (
        <span className="board-flash__success" role="img" aria-label="Correct">
          <CheckIcon width={44} height={44} />
        </span>
      ) : content.kind === 'wrong' ? (
        <span className="board-flash__success board-flash__wrong" role="img" aria-label="Not the move">
          <CloseIcon width={44} height={44} />
        </span>
      ) : (
        <span className="board-flash__line">{content.title}</span>
      )}
    </div>
  );
}
