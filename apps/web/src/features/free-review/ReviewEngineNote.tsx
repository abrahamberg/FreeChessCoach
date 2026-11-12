import { useEffect, type ReactNode } from 'react';
import { trackFunnelEvent, type FunnelSource } from '../../analytics/track.js';
import { keepPendingSave, SAVE_REVIEW_SIGN_IN_URL, type PendingSave } from './pending-save.js';
import type { ReviewEngine, ReviewEngineStatus } from './review-engine-choice.js';

/** Pages that already reported the offer: `signin_offer_shown` once a page. */
let offerShown = false;

export interface ReviewEngineNoteProps {
  status: ReviewEngineStatus;
  onChoose: (engine: ReviewEngine) => void;
  /** The game in review, saved to the account if the visitor signs in. */
  save: PendingSave;
  /** The review is finished, on these engines: say where it ran, with no switch. */
  usedEngines?: ReviewEngine[];
}

/** Where the review runs, a switch to the other engine, and, when this
 * device is slow or the free server is full, the offer to sign in. */
export function ReviewEngineNote({ status, onChoose, save, usedEngines }: ReviewEngineNoteProps): ReactNode {
  const other: ReviewEngine = status.engine === 'server' ? 'device' : 'server';
  const done = usedEngines !== undefined;
  return (
    <div className="free-review__engine" data-review-engine={status.engine}>
      <p className="free-review__engine-text">
        {done ? doneSentence(usedEngines) : engineSentence(status)}{' '}
        {!done && (
          <button type="button" className="free-review__engine-switch" onClick={() => onChoose(other)}>
            {other === 'server' ? 'Use our server instead' : 'Use this device instead'}
          </button>
        )}
      </p>
      {offersSignIn(status) && <FasterReviewOffer save={save} source={save.origin.source} />}
    </div>
  );
}

export function engineSentence({ engine, reason }: ReviewEngineStatus): string {
  if (reason === 'server_unavailable') return 'Our free server is full right now, so this game is reviewed on your device.';
  const where = engine === 'server' ? 'on our server' : 'on your device';
  if (reason === 'slow_device') return `Reviewing ${where}: this looks like a phone or a slower computer. Nothing is saved.`;
  if (reason === 'slow_measured') return `Your device was slow on this game, so the rest runs ${where}. Nothing is saved.`;
  return `Reviewing ${where}. Nothing is saved.`;
}

export function doneSentence(used: ReviewEngine[]): string {
  const where = used.length > 1 ? 'on your device and our server' : used[0] === 'server' ? 'on our server' : 'on your device';
  return `Reviewed ${where}. Nothing was saved.`;
}

function offersSignIn({ reason }: ReviewEngineStatus): boolean {
  return reason === 'slow_device' || reason === 'slow_measured' || reason === 'server_unavailable';
}

function FasterReviewOffer({ save, source }: { save: PendingSave; source: FunnelSource }): ReactNode {
  useEffect(() => {
    if (offerShown) return;
    offerShown = true;
    trackFunnelEvent('signin_offer_shown', { source, signedIn: false, offer: 'faster_review' });
  }, [source]);
  const signIn = (): void => {
    trackFunnelEvent('signin_offer_clicked', { source, signedIn: false, offer: 'faster_review' });
    keepPendingSave(save);
    window.location.assign(SAVE_REVIEW_SIGN_IN_URL);
  };
  return (
    <p className="free-review__engine-offer">
      Faster with a free account: our server reviews every game you import, so your device does no work, and each review stays in your
      history.{' '}
      <button type="button" className="btn-secondary" onClick={signIn}>
        Sign in with Google
      </button>
    </p>
  );
}
