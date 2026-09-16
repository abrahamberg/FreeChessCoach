import { classifyMoves, parsePgn } from '@freechesscoach/chess-analysis';
import type { BookReport, EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildGameReportForAnalysis } from './build-game-report.js';

// Needs >= CONFIG.ratingEstimate.minMovesPlayed (12) moves per side for
// estimatedRating to produce a value at all — a repeated knight shuffle is
// legal every time and long enough without needing a "real" game.
const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8
7. Nf3 Nf6 8. Ng1 Ng8 9. Nf3 Nf6 10. Ng1 Ng8 11. Nf3 Nf6 12. Ng1 Ng8
13. Nf3 Nf6 14. Ng1 Ng8 *`;

const EMPTY_PLAYER_BOOK_REPORT = { lastBookPly: 0, leftBookPly: null, leftBookMove: null, bookAlternatives: [] };
const BOOK: BookReport = {
  source: 'test-fixture@1',
  eco: null,
  ecoVolume: null,
  name: null,
  family: null,
  variation: null,
  namedAtPly: null,
  lastBookPly: 0,
  players: { white: EMPTY_PLAYER_BOOK_REPORT, black: EMPTY_PLAYER_BOOK_REPORT }
};

function buildFixture(userRating: number | null) {
  const game = parsePgn(PGN);
  const evals: EngineEval[] = game.positions.map((position) => ({
    ply: position.ply,
    fen: position.fen,
    depth: 12,
    lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 20, mateIn: null }]
  }));
  const moves = classifyMoves(game, evals, 'white');

  return buildGameReportForAnalysis({
    game,
    evals,
    moves,
    book: BOOK,
    pgnResult: '*',
    userColor: 'white',
    userRating
  });
}

describe('buildGameReportForAnalysis', () => {
  // Task 51.5: userRating feeds §8.5's shrink via priorRating — the pure
  // shrink-toward-prior math itself is covered exhaustively in
  // packages/chess-analysis/src/rating-estimate.test.ts; this only checks
  // the wrapper actually threads the value through instead of hardcoding null.
  test('a known user rating pulls the estimate away from the 1200 default, toward the prior', () => {
    const withoutPrior = buildFixture(null);
    const withPrior = buildFixture(1800);

    const defaultEstimate = withoutPrior.players.white.estimatedRating?.value;
    const priorEstimate = withPrior.players.white.estimatedRating?.value;
    expect(typeof defaultEstimate).toBe('number');
    expect(typeof priorEstimate).toBe('number');
    expect(priorEstimate!).toBeGreaterThan(defaultEstimate!);
  });

  test('the opponent colour never gets the user\'s rating as its prior', () => {
    const report = buildFixture(1800);
    // Black's estimate should behave as if no prior was given at all —
    // i.e. match the white-with-no-prior fixture's black-side estimate.
    const withoutAnyPrior = buildFixture(null);
    expect(report.players.black.estimatedRating).toEqual(withoutAnyPrior.players.black.estimatedRating);
  });
});
