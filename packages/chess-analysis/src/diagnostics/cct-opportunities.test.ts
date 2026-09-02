import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../checks-captures-threats.js';
import { computeCctOpportunities } from './cct-opportunities.js';
import { buildPlyDiagnosticContext } from './context.js';

function moveOn(fenBefore: string, fenAfter: string, moveSan: string, overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan,
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: [moveSan],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore,
    fenAfter,
    ...overrides
  };
}

describe('computeCctOpportunities', () => {
  test('the empty case: a bare-king position yields no opportunities of any kind', () => {
    const fenBefore = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';
    const fenAfter = '8/8/4k3/8/8/3K4/8/8 b - - 0 1';
    const move = moveOn(fenBefore, fenAfter, 'Kd3', {
      checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore)
    });
    const context = buildPlyDiagnosticContext(move)!;

    const opportunities = computeCctOpportunities(context);

    expect(opportunities.unplayedProfitableCaptures).toEqual([]);
    expect(opportunities.unplayedChecks).toEqual([]);
    expect(opportunities.unplayedThreats).toEqual([]);
    expect(opportunities.opponentChecks).toEqual([]);
    expect(opportunities.opponentCaptures).toEqual([]);
    expect(opportunities.opponentThreats).toEqual([]);
  });

  test('reports the mover\'s own unplayed profitable capture and unplayed check', () => {
    const fenBefore = 'r3k3/8/8/8/8/8/8/R3K2R w KQq - 0 1';
    const fenAfter = 'r3k3/8/8/8/8/8/3K4/R6R b q - 1 1';
    const move = moveOn(fenBefore, fenAfter, 'Kd2', {
      checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore)
    });
    const context = buildPlyDiagnosticContext(move)!;

    const opportunities = computeCctOpportunities(context);

    expect(opportunities.unplayedProfitableCaptures.map((m) => m.moveSan)).toEqual(['Rxa8+']);
    // Rxa8+ is itself a checking move (isCheckingMove doesn't exclude captures), so
    // it appears in both lists — this position's unplayed checks are Rh8+ and Rxa8+.
    expect(opportunities.unplayedChecks.map((m) => m.moveSan).sort()).toEqual(['Rh8+', 'Rxa8+']);
  });

  test('excludes the move actually played from its own unplayed lists', () => {
    const fenBefore = 'r3k3/8/8/8/8/8/8/R3K2R w KQq - 0 1';
    const fenAfter = '4k3/8/8/8/8/8/8/R3K2R b Kq - 0 1';
    const move = moveOn(fenBefore, fenAfter, 'Rxa8+', {
      checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore)
    });
    const context = buildPlyDiagnosticContext(move)!;

    const opportunities = computeCctOpportunities(context);

    expect(opportunities.unplayedProfitableCaptures.map((m) => m.moveSan)).not.toContain('Rxa8+');
    expect(opportunities.unplayedChecks.map((m) => m.moveSan)).toEqual(['Rh8+']);
  });

  test('reports the mover\'s own unplayed quiet threat', () => {
    const fenBefore = '4k3/8/1r6/8/6q1/8/8/3QK3 w - - 0 1';
    const fenAfter = '4k3/8/1r6/8/6q1/8/8/3Q1K2 b - - 1 1';
    const move = moveOn(fenBefore, fenAfter, 'Kf1', {
      checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore)
    });
    const context = buildPlyDiagnosticContext(move)!;

    const opportunities = computeCctOpportunities(context);

    expect(opportunities.unplayedThreats.some((t) => t.moveSan === 'Qd6')).toBe(true);
  });

  test('reports the opponent\'s check, capture and threat available after the move, from fenAfter', () => {
    const fenAfter = '3qk3/8/8/6Q1/8/1R6/8/4K3 b - - 0 1';
    const move = moveOn(fenAfter, fenAfter, 'Kd1');
    const context = buildPlyDiagnosticContext(move)!;

    const opportunities = computeCctOpportunities(context);

    expect(opportunities.opponentChecks.map((m) => m.moveSan)).toContain('Qd1+');
    expect(opportunities.opponentCaptures.map((m) => m.moveSan)).toContain('Qxg5');
    expect(opportunities.opponentThreats.some((t) => t.moveSan === 'Qd3')).toBe(true);
  });
});
