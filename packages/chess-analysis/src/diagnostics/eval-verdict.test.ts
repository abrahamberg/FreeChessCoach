import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext, type PlyDiagnosticContext } from './context.js';
import { buildEvalObservation, isDiagnosticallyMeaningfulPly, lossConfirmed } from './eval-verdict.js';

// White has just played Qd5 into the e6 pawn's capture.
const FEN_BEFORE = '4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1';
const FEN_AFTER = '4k3/8/4p3/3Q4/8/8/8/4K3 b - - 0 1';

function contextFor(overrides: Partial<ClassifiedMoveDto> = {}): PlyDiagnosticContext {
  const ctx = buildPlyDiagnosticContext({
    ply: 1,
    moveSan: 'Qd5',
    mover: 'white',
    isUserMove: true,
    cpLoss: 900,
    quality: 'blunder',
    bestLineSan: ['Qd4'],
    evalAfterCp: -900,
    hangsPiece: true,
    drop: 46,
    fenBefore: FEN_BEFORE,
    fenAfter: FEN_AFTER,
    ...overrides
  });
  if (!ctx) throw new Error('fixture must build a context');
  return ctx;
}

describe('lossConfirmed', () => {
  test('true when the played move is meaningfully worse than the best line', () => {
    expect(lossConfirmed(contextFor({ cpBefore: 0, cpAfter: -900 }))).toBe(true);
  });

  test('false for a blunder-labelled move whose eval matches the best line (a sound sacrifice)', () => {
    expect(lossConfirmed(contextFor({ cpBefore: 120, cpAfter: 110 }))).toBe(false);
  });

  test('falls back to the move quality on a legacy move without evals', () => {
    expect(lossConfirmed(contextFor({ quality: 'blunder' }))).toBe(true);
    expect(lossConfirmed(contextFor({ quality: 'good' }))).toBe(false);
  });
});

describe('isDiagnosticallyMeaningfulPly', () => {
  test('false when best and played are both completely won', () => {
    expect(isDiagnosticallyMeaningfulPly(contextFor({ winPctBefore: 97, winPctAfter: 93 }))).toBe(false);
  });

  test('false when best and played are both completely lost', () => {
    expect(isDiagnosticallyMeaningfulPly(contextFor({ winPctBefore: 8, winPctAfter: 2 }))).toBe(false);
  });

  test('true when the move throws away a won position', () => {
    expect(isDiagnosticallyMeaningfulPly(contextFor({ winPctBefore: 95, winPctAfter: 60 }))).toBe(true);
  });

  test('true when win% is missing (legacy)', () => {
    expect(isDiagnosticallyMeaningfulPly(contextFor())).toBe(true);
  });
});

describe('buildEvalObservation', () => {
  test('a failure takes hwdl and a decisive severity from the win% gap', () => {
    const observation = buildEvalObservation(contextFor({ cpBefore: 0, cpAfter: -900 }), 'MS-02', 'D', true, 'left Qd5 en prise');

    expect(observation.failed).toBe(true);
    expect(observation.hwdl).toBeGreaterThan(0.4);
    expect(observation.severity).toBe('decisive');
    expect(observation.reachability).toBe(1);
    expect(observation.ply).toBe(1);
    expect(observation.detail).toBe('left Qd5 en prise');
  });

  test('bands severity by the win% gap', () => {
    expect(buildEvalObservation(contextFor({ cpBefore: 0, cpAfter: -300 }), 'MS-02', 'D', true, '').severity).toBe('major');
    expect(buildEvalObservation(contextFor({ cpBefore: 0, cpAfter: -150 }), 'MS-02', 'D', true, '').severity).toBe('meaningful');
    expect(buildEvalObservation(contextFor({ cpBefore: 0, cpAfter: -20 }), 'MS-02', 'D', false, '').severity).toBe('minor');
  });

  test('a non-failure carries no hwdl', () => {
    expect(buildEvalObservation(contextFor({ cpBefore: 0, cpAfter: -900 }), 'MS-02', 'D', false, '').hwdl).toBe(0);
  });

  test('falls back to drop and quality on a legacy move', () => {
    const observation = buildEvalObservation(contextFor({ drop: 30, quality: 'mistake' }), 'MS-02', 'D', true, '');

    expect(observation.hwdl).toBeCloseTo(0.3);
    expect(observation.severity).toBe('meaningful');
  });
});
