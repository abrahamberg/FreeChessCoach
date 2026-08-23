import type { EngineEval, PositionFeatures } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import {
  isTacticalPosition,
  tacticalEvidence,
  tacticsScore,
  type TacticalPositionInput,
  type TacticsEvidenceMove
} from './tactics-score.js';

const QUIET_FEN = '8/8/8/4k3/8/8/8/4K3 w - - 0 1';

function emptyFeatures(overrides: Partial<PositionFeatures> = {}): PositionFeatures {
  return {
    turn: 'white',
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
  return { ply: 0, fen: QUIET_FEN, depth: 16, lines };
}

function quietInput(overrides: Partial<TacticalPositionInput> = {}): TacticalPositionInput {
  return {
    mover: 'white',
    fenBefore: QUIET_FEN,
    evalBefore: evalWith([
      { moveUci: 'e1e2', moveSan: 'Ke2', cp: 0, mateIn: null },
      { moveUci: 'e1d1', moveSan: 'Kd1', cp: 0, mateIn: null }
    ]),
    features: emptyFeatures(),
    ...overrides
  };
}

describe('isTacticalPosition', () => {
  test('a quiet position with none of the seven signals is not tactical', () => {
    expect(isTacticalPosition(quietInput())).toBe(false);
  });

  test('a forced mate on the board is tactical', () => {
    expect(
      isTacticalPosition(
        quietInput({ evalBefore: evalWith([{ moveUci: 'e1e2', moveSan: 'Ke2', cp: null, mateIn: 3 }]) })
      )
    ).toBe(true);
  });

  test('an 8+ win% gap between the top two lines is tactical', () => {
    expect(
      isTacticalPosition(
        quietInput({
          evalBefore: evalWith([
            { moveUci: 'e1e2', moveSan: 'Ke2', cp: 500, mateIn: null },
            { moveUci: 'e1d1', moveSan: 'Kd1', cp: -500, mateIn: null }
          ])
        })
      )
    ).toBe(true);
  });

  test('a small gap between the top two lines is not tactical', () => {
    expect(
      isTacticalPosition(
        quietInput({
          evalBefore: evalWith([
            { moveUci: 'e1e2', moveSan: 'Ke2', cp: 20, mateIn: null },
            { moveUci: 'e1d1', moveSan: 'Kd1', cp: 15, mateIn: null }
          ])
        })
      )
    ).toBe(false);
  });

  test('any hanging piece on the board is tactical', () => {
    expect(
      isTacticalPosition(
        quietInput({ features: emptyFeatures({ hangingPieces: [{ square: 'd4', piece: 'n', color: 'black', attackers: 1, defenders: 0 }] }) })
      )
    ).toBe(true);
  });

  test('any fork on the board is tactical', () => {
    expect(
      isTacticalPosition(quietInput({ features: emptyFeatures({ forks: [{ square: 'd4', piece: 'n', forkedSquares: ['c2', 'e2'] }] }) }))
    ).toBe(true);
  });

  test('a real (SEE > 0) favorable capture on offer is tactical', () => {
    const fen = '4k3/8/8/8/3r4/8/3R4/4K3 w - - 0 1';
    expect(
      isTacticalPosition(
        quietInput({
          fenBefore: fen,
          features: emptyFeatures({
            captureOpportunities: [{ moveSan: 'Rxd4', from: 'd2', to: 'd4', capturedPiece: 'r', favorable: true }]
          })
        })
      )
    ).toBe(true);
  });

  test('a capture that only breaks even by SEE does not count as favorable', () => {
    const fen = '4k3/3q4/8/8/3r4/8/3R4/4K3 w - - 0 1';
    expect(
      isTacticalPosition(
        quietInput({
          fenBefore: fen,
          features: emptyFeatures({
            captureOpportunities: [{ moveSan: 'Rxd4', from: 'd2', to: 'd4', capturedPiece: 'r', favorable: true }]
          })
        })
      )
    ).toBe(false);
  });

  test('an under-defended piece (attackers > defenders) is tactical', () => {
    expect(
      isTacticalPosition(
        quietInput({
          features: emptyFeatures({
            piecesUnderAttack: [{ square: 'd4', piece: 'r', color: 'white', attackers: 2, defenders: 1 }]
          })
        })
      )
    ).toBe(true);
  });

  test('a best move that delivers check is tactical', () => {
    const fen = '4k3/8/8/8/8/8/8/6KQ w - - 0 1';
    expect(
      isTacticalPosition(
        quietInput({
          fenBefore: fen,
          evalBefore: evalWith([{ moveUci: 'h1h8', moveSan: 'Qh8+', cp: 900, mateIn: null }])
        })
      )
    ).toBe(true);
  });

  test('a best move that is a sound (SEE >= 0) capture is tactical', () => {
    const fen = '4k3/8/8/8/3r4/8/3R4/4K3 w - - 0 1';
    expect(
      isTacticalPosition(
        quietInput({
          fenBefore: fen,
          evalBefore: evalWith([{ moveUci: 'd2d4', moveSan: 'Rxd4', cp: 500, mateIn: null }])
        })
      )
    ).toBe(true);
  });
});

function evidenceMove(overrides: Partial<TacticsEvidenceMove> = {}): TacticsEvidenceMove {
  return {
    mover: 'white',
    quality: 'good',
    fenAfter: QUIET_FEN,
    featureDelta: { newForks: [], newHangingPieces: [], mobilityDelta: 0 },
    isTacticalPosition: true,
    ...overrides
  };
}

describe('tacticalEvidence', () => {
  test('rewards brilliant and great moves regardless of tactical-position flag', () => {
    expect(tacticalEvidence([evidenceMove({ quality: 'brilliant', isTacticalPosition: false })])).toBe(6);
    expect(tacticalEvidence([evidenceMove({ quality: 'great', isTacticalPosition: false })])).toBe(3);
  });

  test('rewards best only when played in a tactical position', () => {
    expect(tacticalEvidence([evidenceMove({ quality: 'best', isTacticalPosition: true })])).toBe(1.5);
    expect(tacticalEvidence([evidenceMove({ quality: 'best', isTacticalPosition: false })])).toBe(0);
  });

  test('penalizes a miss regardless of tactical-position flag', () => {
    expect(tacticalEvidence([evidenceMove({ quality: 'miss', isTacticalPosition: false })])).toBe(-4);
  });

  test('penalizes blunder/mistake only in a tactical position', () => {
    expect(tacticalEvidence([evidenceMove({ quality: 'blunder', isTacticalPosition: true })])).toBe(-3);
    expect(tacticalEvidence([evidenceMove({ quality: 'blunder', isTacticalPosition: false })])).toBe(0);
    expect(tacticalEvidence([evidenceMove({ quality: 'mistake', isTacticalPosition: true })])).toBe(-1.5);
    expect(tacticalEvidence([evidenceMove({ quality: 'mistake', isTacticalPosition: false })])).toBe(0);
  });

  test('penalizes creating a new hanging piece for the mover', () => {
    const move = evidenceMove({
      featureDelta: { newForks: [], newHangingPieces: [{ square: 'd4', piece: 'n', color: 'white', attackers: 1, defenders: 0 }], mobilityDelta: 0 }
    });
    expect(tacticalEvidence([move])).toBe(-2);
  });

  test('does not penalize a new hanging piece belonging to the opponent', () => {
    const move = evidenceMove({
      featureDelta: { newForks: [], newHangingPieces: [{ square: 'd4', piece: 'n', color: 'black', attackers: 1, defenders: 0 }], mobilityDelta: 0 }
    });
    expect(tacticalEvidence([move])).toBe(0);
  });

  test('penalizes allowing a new opponent fork', () => {
    const fenAfter = '4k3/8/8/8/3n4/8/8/2R1K3 b - - 1 1';
    const move = evidenceMove({
      fenAfter,
      featureDelta: { newForks: [{ square: 'd4', piece: 'n', forkedSquares: ['c1', 'e1'] }], newHangingPieces: [], mobilityDelta: 0 }
    });
    expect(tacticalEvidence([move])).toBe(-2);
  });

  test('does not penalize a new fork belonging to the mover', () => {
    const fenAfter = '4k3/8/8/8/3N4/8/8/4K3 b - - 1 1';
    const move = evidenceMove({
      fenAfter,
      featureDelta: { newForks: [{ square: 'd4', piece: 'n', forkedSquares: ['c6', 'e6'] }], newHangingPieces: [], mobilityDelta: 0 }
    });
    expect(tacticalEvidence([move])).toBe(0);
  });

  test('sums evidence across multiple moves', () => {
    const moves = [
      evidenceMove({ quality: 'brilliant' }),
      evidenceMove({ quality: 'miss' }),
      evidenceMove({ quality: 'blunder', isTacticalPosition: true })
    ];
    expect(tacticalEvidence(moves)).toBe(6 - 4 - 3);
  });
});

describe('tacticsScore', () => {
  test('returns null with a reason when fewer than 4 tactical positions were seen', () => {
    const moves = [evidenceMove(), evidenceMove(), evidenceMove()];
    expect(tacticsScore(moves, 80)).toEqual({ score: null, reason: 'insufficient tactical positions' });
  });

  test('returns null when tacticalAccuracy itself is null even with enough tactical positions', () => {
    const moves = [evidenceMove(), evidenceMove(), evidenceMove(), evidenceMove()];
    expect(tacticsScore(moves, null)).toEqual({ score: null, reason: 'insufficient tactical positions' });
  });

  test('combines tacticalAccuracy with the clamped evidence adjustment', () => {
    const moves = [
      evidenceMove({ quality: 'brilliant' }),
      evidenceMove({ quality: 'brilliant' }),
      evidenceMove({ quality: 'brilliant' }),
      evidenceMove({ quality: 'good' })
    ];
    // evidence = 6+6+6 = 18, clamped to 15; 80 + 15 = 95
    expect(tacticsScore(moves, 80)).toEqual({ score: 95 });
  });

  test('clamps the final score to 100', () => {
    const moves = [
      evidenceMove({ quality: 'brilliant' }),
      evidenceMove({ quality: 'brilliant' }),
      evidenceMove({ quality: 'brilliant' }),
      evidenceMove({ quality: 'brilliant' })
    ];
    expect(tacticsScore(moves, 95)).toEqual({ score: 100 });
  });
});
