import type { EngineEval, PositionFeatures } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildReasons, type MoveReasonsInput } from './move-reasons.js';

const FEN_BEFORE = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const FEN_AFTER = '4k3/8/8/8/8/8/8/4K3 b - - 1 1';

function emptyFeatures(overrides: Partial<PositionFeatures> = {}): PositionFeatures {
  return {
    turn: 'black',
    boardState: 'none',
    availableMoves: [],
    mobility: { white: 0, black: 0 },
    controlledSquares: [],
    piecesUnderAttack: [],
    hangingPieces: [],
    underDefendedPieces: [],
    overloadedDefenders: [],
    centerControlScore: { white: 0, black: 0 },
    openFiles: [],
    semiOpenFiles: [],
    doubledPawns: [],
    isolatedPawns: [],
    passedPawns: [],
    targetsAttacked: [],
    forks: [],
    captureOpportunities: [],
    ...overrides
  };
}

function evalWith(lines: EngineEval['lines']): EngineEval {
  return { ply: 0, fen: FEN_BEFORE, depth: 16, lines };
}

function baseInput(overrides: Partial<MoveReasonsInput> = {}): MoveReasonsInput {
  return {
    mover: 'white',
    fenBefore: FEN_BEFORE,
    fenAfter: FEN_AFTER,
    moveSan: 'Kd1',
    evalBefore: evalWith([{ moveUci: 'e1d1', moveSan: 'Kd1', cp: 0, mateIn: null }]),
    isBookMove: false,
    featureDelta: { newForks: [], newHangingPieces: [], mobilityDelta: 0 },
    featuresBefore: emptyFeatures(),
    featuresAfter: emptyFeatures(),
    ...overrides
  };
}

describe('buildReasons', () => {
  test('book move returns only the theory reason', () => {
    const reasons = buildReasons(baseInput({ isBookMove: true, openingName: 'Sicilian Defense: Najdorf Variation', eco: 'B90' }));
    expect(reasons).toEqual(['Theory — Sicilian Defense: Najdorf Variation (B90)']);
  });

  test('new hanging piece for the mover', () => {
    const reasons = buildReasons(baseInput({
      featureDelta: {
        newForks: [],
        newHangingPieces: [{ square: 'd4', piece: 'n', color: 'white', attackers: 1, defenders: 0 }],
        mobilityDelta: 0
      }
    }));
    expect(reasons).toEqual(['Leaves the knight on d4 undefended']);
  });

  test('ignores a new hanging piece belonging to the opponent', () => {
    const reasons = buildReasons(baseInput({
      featureDelta: {
        newForks: [],
        newHangingPieces: [{ square: 'd4', piece: 'n', color: 'black', attackers: 1, defenders: 0 }],
        mobilityDelta: 0
      }
    }));
    expect(reasons).toEqual([]);
  });

  test('missed a winning capture', () => {
    const before = '4k3/8/8/8/3r4/8/3R4/4K3 w - - 0 1';
    const after = '4k3/8/8/8/3r4/8/3RK3/8 b - - 1 1';
    const reasons = buildReasons(baseInput({
      fenBefore: before,
      fenAfter: after,
      moveSan: 'Ke2',
      evalBefore: evalWith([
        { moveUci: 'd2d4', moveSan: 'Rxd4', cp: 300, mateIn: null },
        { moveUci: 'e1e2', moveSan: 'Ke2', cp: 0, mateIn: null }
      ])
    }));
    expect(reasons).toEqual(['Missed Rxd4, winning material on d4']);
  });

  test('does not flag a missed capture that nets negative by SEE', () => {
    const before = '4k3/3q4/8/8/3p4/8/3R4/4K3 w - - 0 1';
    const reasons = buildReasons(baseInput({
      fenBefore: before,
      moveSan: 'Ke2',
      evalBefore: evalWith([
        { moveUci: 'd2d4', moveSan: 'Rxd4', cp: 300, mateIn: null },
        { moveUci: 'e1e2', moveSan: 'Ke2', cp: 0, mateIn: null }
      ])
    }));
    expect(reasons).toEqual([]);
  });

  test('missed mate favouring the mover', () => {
    const reasons = buildReasons(baseInput({
      evalBefore: evalWith([
        { moveUci: 'h5h7', moveSan: 'Qh7#', cp: null, mateIn: 1 },
        { moveUci: 'e1d1', moveSan: 'Kd1', cp: 500, mateIn: null }
      ])
    }));
    expect(reasons).toEqual(['Missed mate in 1 starting with Qh7#']);
  });

  test('ignores a mate score that favors the opponent, not the mover', () => {
    const reasons = buildReasons(baseInput({
      evalBefore: evalWith([
        { moveUci: 'h5h7', moveSan: 'Qh7#', cp: null, mateIn: -1 },
        { moveUci: 'e1d1', moveSan: 'Kd1', cp: 500, mateIn: null }
      ])
    }));
    expect(reasons).toEqual([]);
  });

  test('new fork against the mover created by the move', () => {
    const after = '4k3/8/8/8/3n4/8/8/2R1K3 b - - 1 1';
    const reasons = buildReasons(baseInput({
      fenAfter: after,
      featureDelta: {
        newForks: [{ square: 'd4', piece: 'n', forkedSquares: ['c1', 'e2'] }],
        newHangingPieces: [],
        mobilityDelta: 0
      }
    }));
    expect(reasons).toEqual(['Allows knight fork on d4 hitting c1 and e2']);
  });

  test('ignores a new fork belonging to the mover', () => {
    const after = '4k3/8/8/8/3N4/8/8/4K3 b - - 1 1';
    const reasons = buildReasons(baseInput({
      fenAfter: after,
      featureDelta: {
        newForks: [{ square: 'd4', piece: 'n', forkedSquares: ['c6', 'e6'] }],
        newHangingPieces: [],
        mobilityDelta: 0
      }
    }));
    expect(reasons).toEqual([]);
  });

  test('mover piece left attacked more than defended', () => {
    const reasons = buildReasons(baseInput({
      featuresAfter: emptyFeatures({
        underDefendedPieces: [{ square: 'd4', piece: 'r', color: 'white', attackers: 2, defenders: 1 }]
      })
    }));
    expect(reasons).toEqual(['Leaves rook on d4 attacked 2× and defended 1×']);
  });

  test('center control swing of at least 3 against the mover', () => {
    const reasons = buildReasons(baseInput({
      featuresBefore: emptyFeatures({ centerControlScore: { white: 4, black: 2 } }),
      featuresAfter: emptyFeatures({ centerControlScore: { white: 1, black: 4 } })
    }));
    expect(reasons).toEqual(['Concedes the centre']);
  });

  test('below the center control swing threshold is not flagged', () => {
    const reasons = buildReasons(baseInput({
      featuresBefore: emptyFeatures({ centerControlScore: { white: 4, black: 2 } }),
      featuresAfter: emptyFeatures({ centerControlScore: { white: 3, black: 3 } })
    }));
    expect(reasons).toEqual([]);
  });

  test('creates a new passed pawn for the mover', () => {
    const reasons = buildReasons(baseInput({
      featuresBefore: emptyFeatures({ passedPawns: [] }),
      featuresAfter: emptyFeatures({ passedPawns: [{ square: 'd6', color: 'white' }] })
    }));
    expect(reasons).toEqual(['Creates a passed pawn on d']);
  });

  test('does not re-flag an already-passed pawn', () => {
    const reasons = buildReasons(baseInput({
      featuresBefore: emptyFeatures({ passedPawns: [{ square: 'd6', color: 'white' }] }),
      featuresAfter: emptyFeatures({ passedPawns: [{ square: 'd6', color: 'white' }] })
    }));
    expect(reasons).toEqual([]);
  });

  test('mobility drop of at least 8 squares', () => {
    const reasons = buildReasons(baseInput({
      quality: 'mistake',
      featureDelta: { newForks: [], newHangingPieces: [], mobilityDelta: -9 }
    }));
    expect(reasons).toEqual(['Costs 9 squares of piece mobility']);
  });

  test('a move that cost nothing is never faulted for its mobility', () => {
    // The natural recapture gives squares up by definition; "Costs 9 squares
    // of piece mobility" as the whole note on a best move reads as a
    // criticism of the only sensible move on the board.
    for (const quality of ['best', 'great', 'excellent', 'good'] as const) {
      const reasons = buildReasons(baseInput({
        quality,
        featureDelta: { newForks: [], newHangingPieces: [], mobilityDelta: -9 }
      }));
      expect(reasons).toEqual([]);
    }
  });

  test('below the mobility drop threshold is not flagged', () => {
    const reasons = buildReasons(baseInput({
      quality: 'mistake',
      featureDelta: { newForks: [], newHangingPieces: [], mobilityDelta: -7 }
    }));
    expect(reasons).toEqual([]);
  });

  test('names the exchange on a trade that has no fault to report', () => {
    // The Scotch after 4.Nxd4: ...Nxd4 is the natural trade and had nothing
    // but the "Best move" badge to show for it.
    const reasons = buildReasons(baseInput({
      quality: 'best',
      mover: 'black',
      fenBefore: 'r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4',
      moveSan: 'Nxd4',
      evalBefore: evalWith([{ moveUci: 'c6d4', moveSan: 'Nxd4', cp: 0, mateIn: null }])
    }));
    expect(reasons).toEqual(['Trades knights on d4']);
  });

  test('names the recapture rather than what it gave up', () => {
    const reasons = buildReasons(baseInput({
      quality: 'best',
      fenBefore: 'r1bqkbnr/pppp1ppp/8/8/3nP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 5',
      moveSan: 'Qxd4',
      isRecapture: true,
      evalBefore: evalWith([{ moveUci: 'd1d4', moveSan: 'Qxd4', cp: 0, mateIn: null }]),
      featureDelta: { newForks: [], newHangingPieces: [], mobilityDelta: -9 }
    }));
    expect(reasons).toEqual(['Recaptures the knight on d4']);
  });

  test('mobility is dropped once a better reason already explains the move', () => {
    const reasons = buildReasons(baseInput({
      featureDelta: {
        newForks: [],
        newHangingPieces: [{ square: 'd4', piece: 'n', color: 'white', attackers: 1, defenders: 0 }],
        mobilityDelta: -9
      }
    }));
    expect(reasons).toEqual(['Leaves the knight on d4 undefended']);
  });

  test('caps at two reasons, prioritising mate over everything else', () => {
    const reasons = buildReasons(baseInput({
      evalBefore: evalWith([
        { moveUci: 'h5h7', moveSan: 'Qh7#', cp: null, mateIn: 1 },
        { moveUci: 'e1d1', moveSan: 'Kd1', cp: 500, mateIn: null }
      ]),
      featureDelta: {
        newForks: [],
        newHangingPieces: [{ square: 'd4', piece: 'n', color: 'white', attackers: 1, defenders: 0 }],
        mobilityDelta: -9
      },
      featuresBefore: emptyFeatures({ centerControlScore: { white: 4, black: 2 } }),
      featuresAfter: emptyFeatures({ centerControlScore: { white: 1, black: 4 } })
    }));
    expect(reasons).toEqual(['Missed mate in 1 starting with Qh7#', 'Leaves the knight on d4 undefended']);
  });

  test('falls back to a generic theory label when no opening name is known', () => {
    const reasons = buildReasons(baseInput({ isBookMove: true }));
    expect(reasons).toEqual(['Theory — known opening move']);
  });
});
