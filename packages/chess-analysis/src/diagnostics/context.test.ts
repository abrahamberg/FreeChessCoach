import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from './context.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function baseMove(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'e4',
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    quality: 'best',
    bestLineSan: ['e4'],
    evalAfterCp: 20,
    hangsPiece: false,
    fenBefore: START_FEN,
    fenAfter: AFTER_E4_FEN,
    ...overrides
  };
}

describe('buildPlyDiagnosticContext', () => {
  test('returns null when fenAfter is missing (legacy stored analysis)', () => {
    expect(buildPlyDiagnosticContext(baseMove({ fenAfter: undefined }))).toBeNull();
  });

  test('returns null when fenBefore is missing', () => {
    expect(buildPlyDiagnosticContext(baseMove({ fenBefore: undefined }))).toBeNull();
  });

  test('computes opponentChecksCapturesThreats on fenAfter, not fenBefore', () => {
    const context = buildPlyDiagnosticContext(baseMove());

    expect(context).not.toBeNull();
    expect(context!.opponentChecksCapturesThreats).toEqual(analyzeChecksCapturesThreats(AFTER_E4_FEN));
    expect(context!.opponentChecksCapturesThreats).not.toEqual(analyzeChecksCapturesThreats(START_FEN));
  });

  test('leaves moveTime undefined when no clock entry matches this ply', () => {
    const context = buildPlyDiagnosticContext(baseMove());

    expect(context!.moveTime).toBeUndefined();
  });

  test('attaches this ply\'s clock reading from moveTimes when one is present', () => {
    const context = buildPlyDiagnosticContext(baseMove(), [
      { ply: 1, clockMs: 598000, evalCp: 20, timeSpentMs: 2000 },
      { ply: 2, clockMs: 597000, evalCp: 18, timeSpentMs: 3000 }
    ]);

    expect(context!.moveTime).toEqual({ ply: 1, clockMs: 598000, evalCp: 20, timeSpentMs: 2000 });
  });

  test('passes optional analysis fields through unchanged', () => {
    const context = buildPlyDiagnosticContext(
      baseMove({ isTacticalPosition: true, bestMoveSan: 'e4', bestLinePvSan: ['e4', 'e5'] })
    );

    expect(context!.isTacticalPosition).toBe(true);
    expect(context!.bestMoveSan).toBe('e4');
    expect(context!.bestLinePvSan).toEqual(['e4', 'e5']);
  });
});
