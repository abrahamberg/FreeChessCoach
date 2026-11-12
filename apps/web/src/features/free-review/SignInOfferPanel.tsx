import { useEffect, useRef, type ReactNode } from 'react';
import { trackFunnelEvent, type SignInOffer } from '../../analytics/track.js';
import { keepPendingSave, SAVE_REVIEW_SIGN_IN_URL, type PendingSave } from './pending-save.js';

/** Reviews whose offer was already reported: stepping back and forward again
 * shows the panel again but sends `signin_offer_shown` once per review. */
const shownFor = new WeakSet<object>();

export interface SignInOfferPanelProps {
  /** The game to save after sign-in. */
  save: PendingSave;
  /** One object per review (the reviewed game), for the shown-once rule. */
  reviewKey: object;
}

/**
 * The end of a free review: two reasons to sign in, both through Google
 * sign-in to the save page, which imports this same game into the account
 * (the normal import, where the quota applies) and opens its saved review.
 * Shown only once the visitor has reached the last move, so nothing
 * interrupts the review itself.
 */
export function SignInOfferPanel({ save, reviewKey }: SignInOfferPanelProps): ReactNode {
  const source = save.origin.source;
  const panel = useRef<HTMLElement>(null);
  // On a phone the panel sits below the board: bring it into view once it appears.
  useEffect(() => {
    panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);
  useEffect(() => {
    if (shownFor.has(reviewKey)) return;
    shownFor.add(reviewKey);
    trackFunnelEvent('signin_offer_shown', { source, signedIn: false });
  }, [reviewKey, source]);

  const choose = (offer: SignInOffer): void => {
    trackFunnelEvent('signin_offer_clicked', { source, signedIn: false, offer });
    keepPendingSave(save);
    window.location.assign(SAVE_REVIEW_SIGN_IN_URL);
  };

  return (
    <section ref={panel} className="free-review__offer" aria-labelledby="free-review-offer-title">
      <h2 id="free-review-offer-title" className="free-review__offer-title">
        That was the whole game. What next?
      </h2>
      <p className="free-review__offer-text">Sign in with Google, free, and this game is saved to your account with its review.</p>
      <div className="free-review__offer-actions">
        <button type="button" className="btn-primary" onClick={() => choose('keep_game')}>
          Keep this game
        </button>
        <button type="button" className="btn-secondary" onClick={() => choose('repeat_mistakes')}>
          See if your mistakes repeat in other games
        </button>
      </div>
    </section>
  );
}
