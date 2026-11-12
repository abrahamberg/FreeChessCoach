import { TACTIC_MOTIF_TYPES, type GameReport } from '@freechesscoach/shared';

/** A whole Game Report with made-up numbers and no moves (the moves come
 * from the game's annotated PGN when it is read back). */
export function buildGameReportFixture(): GameReport {
  const playerReport = {
    accuracy: 87.4,
    phaseAccuracy: { opening: 92.1, middlegame: 80.5, endgame: null },
    phaseConfidence: { opening: 'ok' as const, middlegame: 'ok' as const, endgame: 'none' as const },
    scores: { opening: 90, tactics: 75, strategy: 82, endgame: null },
    strategySubScores: { pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: { standing: null, theme: null },
    counts: {
      brilliant: 0,
      great: 0,
      best: 2,
      excellent: 0,
      good: 1,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      miss: 0,
      blunder: 0,
      forced: 0
    },
    acpl: 24.6,
    estimatedRating: { value: 1550, range: [1400, 1700] as [number, number], confidence: 'medium' as const },
    tacticMotifs: Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])) as GameReport['players']['white']['tacticMotifs'],
    openingMistakes: 0
  };

  return {
    engine: { name: 'stockfish', depth: 16, multiPv: 3 },
    book: {
      source: 'test-fixture@1',
      eco: 'C50',
      ecoVolume: 'C',
      name: 'Italian Game',
      family: 'Italian Game',
      variation: null,
      namedAtPly: 4,
      lastBookPly: 6,
      players: {
        white: { lastBookPly: 6, leftBookPly: null, leftBookMove: null, bookAlternatives: [] },
        black: { lastBookPly: 6, leftBookPly: null, leftBookMove: null, bookAlternatives: [] }
      }
    },
    phases: { openingEndPly: 10, endgameStartPly: null, openingSource: 'book' },
    players: { white: playerReport, black: playerReport },
    moves: []
  };
}
