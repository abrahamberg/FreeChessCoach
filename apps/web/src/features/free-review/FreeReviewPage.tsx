import { useEffect, type ReactNode } from 'react';
import { AppShell } from '../../components/AppShell.js';
import { getSharedEngineWorker } from '../../engine/shared-engine-worker-instance.js';
import { EngineLinesProvider } from '../live-review/engine-lines-source.js';
import { GameReviewView } from '../review/GameReviewView.js';
import { browserEngineLines } from './browser-lines.js';
import { GameChooser } from './GameChooser.js';
import { ReviewProgress } from './ReviewProgress.js';
import { readGameInput } from './game-input.js';
import { PASTED_ORIGIN } from './review-origin.js';
import { SignInOfferPanel } from './SignInOfferPanel.js';
import { useFreeReview } from './useFreeReview.js';
import { useReviewLink } from './useReviewLink.js';
import './FreeReviewPage.css';

/**
 * `/review`: Game Review for anyone, no account. The visitor pastes a PGN or
 * picks a recent Chess.com or Lichess game, the engine runs in this browser,
 * and the review is the one a signed-in player gets (the same steps, the
 * same notes). Nothing reaches this app's server: no game, no username, no
 * quota, and leaving the page drops the review.
 *
 * A link can start it: `/review#pgn=<encodeURIComponent(pgn)>&side=black&ply=12`
 * reviews that game at once and shows that ply (a later hash change with a
 * new `ply` moves the board; a new `pgn` starts a new review). The page's
 * root carries `data-review-state` (choosing, reviewing, ready, failed), and
 * the board and the note `data-testid="review-board"` / `"review-note"`: the
 * studio's recorder (`studio record review`) builds on these.
 *
 * On the last move the review offers sign-in (SignInOfferPanel), which saves
 * this game to the new account on `/save-review`.
 */
export function FreeReviewPage(): ReactNode {
  const { state, start, reset } = useFreeReview();
  const link = useReviewLink();
  // The engine is a large download the first time: start it while the visitor picks a game.
  useEffect(() => getSharedEngineWorker().preload(), []);
  useEffect(() => {
    const input = link.pgn === null ? null : readGameInput(link.pgn);
    if (input?.ok) start(input.pgn, link.side, PASTED_ORIGIN);
  }, [link.pgn, link.side, start]);

  if (state.kind === 'ready') {
    return (
      <AppShell guest bare>
        <div data-review-state="ready" className="game-review-contents">
          <EngineLinesProvider source={browserEngineLines}>
            <GameReviewView
              game={state.game}
              coachPersona="general"
              onBack={reset}
              showPly={link.ply}
              notice={<p className="free-review__notice">Reviewed on your device. Nothing was saved.</p>}
              endPanel={<SignInOfferPanel save={{ pgn: state.game.pgn, userColor: state.game.userColor, origin: state.origin }} reviewKey={state.game} />}
            />
          </EngineLinesProvider>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell guest>
      <div className="page free-review" data-review-state={state.kind}>
        <h1>Free game review</h1>
        <p className="free-review__lead">
          Every move of your game, explained in words. No account, nothing saved: the engine runs in your browser.
        </p>
        {state.kind === 'reviewing' ? (
          <ReviewProgress done={state.done} total={state.total} onCancel={reset} />
        ) : (
          <>
            {state.kind === 'failed' && (
              <p role="alert" className="free-review__error">
                {state.error}
              </p>
            )}
            <GameChooser onReview={start} />
          </>
        )}
      </div>
    </AppShell>
  );
}
