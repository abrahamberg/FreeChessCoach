import { useEffect, useMemo, type ReactNode } from 'react';
import { AppShell } from '../../components/AppShell.js';
import { getSharedEngineWorker } from '../../engine/shared-engine-worker-instance.js';
import { EngineLinesProvider } from '../live-review/engine-lines-source.js';
import { GameReviewView } from '../review/GameReviewView.js';
import { freeReviewEngineLines } from './browser-lines.js';
import { GameChooser } from './GameChooser.js';
import { ReviewEngineNote } from './ReviewEngineNote.js';
import { ReviewProgress } from './ReviewProgress.js';
import { readGameInput } from './game-input.js';
import { PASTED_ORIGIN } from './review-origin.js';
import { SignInOfferPanel } from './SignInOfferPanel.js';
import { useFreeReview } from './useFreeReview.js';
import { useReviewEngine } from './useReviewEngine.js';
import { useReviewLink } from './useReviewLink.js';
import './FreeReviewPage.css';

/**
 * `/review`: Game Review for anyone, no account. The visitor pastes a PGN or
 * picks a recent Chess.com or Lichess game and gets the review a signed-in
 * player gets (the same steps, the same notes). The engine runs in this
 * browser; on a phone or a slow computer the positions go to the server's
 * engine instead (`/api/public/review-engine`, capped per visitor), and the
 * page offers sign-in for faster reviews. Nothing is stored: no game, no
 * username, no quota, and leaving the page drops the review.
 *
 * A link can start it: `/review#pgn=<encodeURIComponent(pgn)>&side=black&ply=12`
 * reviews that game at once and shows that ply (a later hash change with a
 * new `ply` moves the board; a new `pgn` starts a new review); `&engine=device`
 * or `server` pins the engine. The page's root carries `data-review-state`
 * (choosing, reviewing, ready, failed), and the board and the note
 * `data-testid="review-board"` / `"review-note"`: the studio's recorder
 * (`studio record review`) builds on these.
 *
 * On the last move the review offers sign-in (SignInOfferPanel), which saves
 * this game to the new account on `/save-review`.
 */
export function FreeReviewPage(): ReactNode {
  const link = useReviewLink();
  const { engines, status, choose } = useReviewEngine(link.engine);
  const { state, start, reset } = useFreeReview(engines);
  const engineLines = useMemo(() => freeReviewEngineLines(engines), [engines]);
  // The engine is a large download the first time: start it while the visitor
  // picks a game, unless this review is going to the server.
  const onDevice = status.engine === 'device';
  useEffect(() => {
    if (onDevice) getSharedEngineWorker().preload();
  }, [onDevice]);
  useEffect(() => {
    const input = link.pgn === null ? null : readGameInput(link.pgn);
    if (input?.ok) start(input.pgn, link.side, PASTED_ORIGIN);
  }, [link.pgn, link.side, start]);

  if (state.kind === 'ready') {
    const save = { pgn: state.game.pgn, userColor: state.game.userColor, origin: state.origin };
    return (
      <AppShell guest bare>
        <div data-review-state="ready" className="game-review-contents">
          <EngineLinesProvider source={engineLines}>
            <GameReviewView
              game={state.game}
              coachPersona="general"
              onBack={reset}
              showPly={link.ply}
              notice={
                <div className="free-review__notice">
                  <ReviewEngineNote status={status} onChoose={choose} save={save} usedEngines={state.usedEngines} />
                </div>
              }
              endPanel={<SignInOfferPanel save={save} reviewKey={state.game} />}
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
          Every move of your game, explained in words. No account and nothing saved: the engine runs in your browser, or on our server when your
          device is slow.
        </p>
        {state.kind === 'reviewing' ? (
          <>
            <ReviewProgress done={state.done} total={state.total} onCancel={reset} />
            <ReviewEngineNote status={status} onChoose={choose} save={state.save} />
          </>
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
