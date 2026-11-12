import { useState, type ReactNode } from 'react';
import { shareLinkUrl, useReviewShare } from './useReviewShare.js';
import './ShareReviewControl.css';

/** "Share this review": a public, read-only link to this game's review,
 * which the owner can copy and turn off again (growth plan A6). The link
 * shows the moves, the notes and the players' names, nothing of the account. */
export function ShareReviewControl({ gameId }: { gameId: string }): ReactNode {
  const { token, isLoading, share, stop, isBusy, failed } = useReviewShare(gameId);
  const [copied, setCopied] = useState(false);
  if (isLoading) return null;

  const copy = (url: string): void => {
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false)
    );
  };

  return (
    <div className="share-review">
      {token === null ? (
        <button type="button" className="btn-secondary share-review__button" onClick={share} disabled={isBusy}>
          Share this review
        </button>
      ) : (
        <>
          <input className="share-review__url" readOnly value={shareLinkUrl(token, window.location.origin)} aria-label="Link to this review" onFocus={(event) => event.target.select()} />
          <button type="button" className="btn-secondary share-review__button" onClick={() => copy(shareLinkUrl(token, window.location.origin))}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" className="btn-ghost share-review__button" onClick={stop} disabled={isBusy}>
            Turn off link
          </button>
        </>
      )}
      {token !== null && <p className="share-review__hint">Anyone with the link sees this review and the players&apos; names, nothing else.</p>}
      {failed && (
        <p className="share-review__error" role="alert">
          That did not work. Try again.
        </p>
      )}
    </div>
  );
}
