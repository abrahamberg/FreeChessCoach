import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { TA_OFFENSIVE_DETECTORS } from './ta-offensive.js';

const KNIGHT_FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';

function detectorFor(code: string) {
  const detector = TA_OFFENSIVE_DETECTORS.find((d) => d.code === code);
  if (!detector) throw new Error(`no offensive detector registered for ${code}`);
  return detector;
}

function playMove(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'Kb1',
    mover: 'white',
    isUserMove: true,
    cpLoss: 400,
    quality: 'blunder',
    bestLineSan: ['Nd6+'],
    evalAfterCp: -400,
    hangsPiece: false,
    drop: 45,
    fenBefore: KNIGHT_FORK_FEN,
    fenAfter: '4k3/1r6/8/8/2N5/8/1K6/8 b - - 1 1',
    bestMoveSan: 'Nd6+',
    ...overrides
  };
}

describe('TA_OFFENSIVE_DETECTORS', () => {
  test('has exactly one detector per offensive code, all direction O', () => {
    const codes = TA_OFFENSIVE_DETECTORS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(TA_OFFENSIVE_DETECTORS.every((d) => d.direction === 'O')).toBe(true);
  });

  test('TA-01 fires straight off tacticOpportunity, no replay needed', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove({ tacticOpportunity: { type: 'checkmate', found: false, detail: null } })
    )!;

    const observation = detectorFor('TA-01').detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('TA-01');
    expect(observation!.direction).toBe('O');
    expect(observation!.failed).toBe(true);
  });

  test('records failed: false when the player played the opportunity move', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove({ tacticOpportunity: { type: 'checkmate', found: true, detail: null } })
    )!;

    const observation = detectorFor('TA-01').detect(ctx);

    expect(observation!.failed).toBe(false);
  });

  test('TA-07 fires only when the fork replay resolves to the knight sub-code', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove({ tacticOpportunity: { type: 'fork', found: false, detail: 'Nd6+ forks king and rook' } })
    )!;

    const observation = detectorFor('TA-07').detect(ctx);

    expect(observation).not.toBeNull();
    expect(observation!.code).toBe('TA-07');
    expect(detectorFor('TA-08').detect(ctx)).toBeNull();
    expect(detectorFor('TA-09').detect(ctx)).toBeNull();
    expect(detectorFor('TA-10').detect(ctx)).toBeNull();
  });

  test('does not fire when there is no tacticOpportunity at all', () => {
    const ctx = buildPlyDiagnosticContext(playMove())!;

    expect(detectorFor('TA-01').detect(ctx)).toBeNull();
    expect(detectorFor('TA-07').detect(ctx)).toBeNull();
  });

  test('attaches the played move\'s rank when it also embodies the opportunity motif', () => {
    const ctx = buildPlyDiagnosticContext(
      playMove({ tacticOpportunity: { type: 'fork', found: false, detail: 'Nd6+ forks king and rook' } }),
      { tacticRankHits: [{ ply: 1, motif: 'fork', rank: 2, playedRank: 2 }] }
    )!;

    const observation = detectorFor('TA-07').detect(ctx);

    expect(observation!.rank).toBe(2);
  });
});
