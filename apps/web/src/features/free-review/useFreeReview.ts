import type { GameReview } from '@freechesscoach/chess-analysis';
import { parsePgn } from '@freechesscoach/chess-analysis';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trackFunnelEvent } from '../../analytics/track.js';
import type { ReviewedGame } from '../review/reviewed-game.js';
import { reviewGameInBrowser, ReviewCancelledError } from './review-in-browser.js';
import type { ReviewOrigin } from './review-origin.js';

export type FreeReviewState =
  | { kind: 'choosing' }
  | { kind: 'reviewing'; done: number; total: number }
  | { kind: 'ready'; game: ReviewedGame; origin: ReviewOrigin }
  | { kind: 'failed'; error: string };

/** The game as Game Review shows it, from the review made in the browser. */
export function toReviewedGame(pgn: string, userColor: 'white' | 'black', review: GameReview): ReviewedGame {
  const { headers } = parsePgn(pgn);
  return {
    pgn,
    userColor,
    whiteName: headers['White'] ?? null,
    blackName: headers['Black'] ?? null,
    result: headers['Result'] ?? null,
    classifiedMoves: review.gameReport.moves,
    gameReport: review.gameReport,
    // "Unusual for you" needs the player's own record, which only an account has.
    tacticBaseline: null
  };
}

/** One review at a time: starting another, going back or leaving the page
 * stops the one in progress. Sends `review_started` and `review_completed`
 * with `signed_in: false`. */
export function useFreeReview() {
  const [state, setState] = useState<FreeReviewState>({ kind: 'choosing' });
  const running = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    running.current?.abort();
    running.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const start = useCallback(
    (pgn: string, userColor: 'white' | 'black', origin: ReviewOrigin) => {
      stop();
      trackFunnelEvent('review_started', { source: origin.source, signedIn: false });
      const controller = new AbortController();
      running.current = controller;
      setState({ kind: 'reviewing', done: 0, total: 0 });
      const onProgress = (done: number, total: number): void => {
        if (!controller.signal.aborted) setState({ kind: 'reviewing', done, total });
      };
      reviewGameInBrowser({ pgn, userColor, signal: controller.signal, onProgress }).then(
        (review) => {
          if (controller.signal.aborted) return;
          trackFunnelEvent('review_completed', { source: origin.source, signedIn: false });
          setState({ kind: 'ready', game: toReviewedGame(pgn, userColor, review), origin });
        },
        (error: unknown) => {
          if (error instanceof ReviewCancelledError || controller.signal.aborted) return;
          console.error('free review failed:', error);
          setState({ kind: 'failed', error: 'The engine could not finish this game. Try again, or try another game.' });
        }
      );
    },
    [stop]
  );

  const reset = useCallback(() => {
    stop();
    setState({ kind: 'choosing' });
  }, [stop]);

  return { state, start, reset };
}
