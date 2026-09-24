import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { missedChance, lineCpFor, realChance } from './chance-inventory.js';
import { buildPlyDiagnosticContext, type PlyDiagnosticContext } from './context.js';

/** White to move can win the undefended d5 knight with Bxd5; Qxg5?? is a
 * poisoned capture (hxg5), and Qc3 is a quiet alternative. */
const FEN_BEFORE = 'r3k2r/ppp2p2/7p/3n2p1/8/5B2/PPPQ1PPP/R3K2R w KQkq - 0 1';
const FEN_AFTER = 'r3k2r/ppp2p2/7p/3B2p1/8/8/PPPQ1PPP/R3K2R b KQkq - 0 1';

function contextFor(overrides: Partial<ClassifiedMoveDto> = {}): PlyDiagnosticContext {
  const ctx = buildPlyDiagnosticContext({
    ply: 1,
    moveSan: 'Bxd5',
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    quality: 'best',
    bestLineSan: ['Bxd5'],
    evalAfterCp: 320,
    hangsPiece: false,
    fenBefore: FEN_BEFORE,
    fenAfter: FEN_AFTER,
    bestMoveSan: 'Bxd5',
    cpBefore: 320,
    cpAfter: 320,
    alternatives: [
      { san: 'Qc3', cp: 10, winPct: 50.9 },
      { san: 'O-O', cp: 0, winPct: 50 }
    ],
    ...overrides
  });
  if (!ctx) throw new Error('fixture must build a context');
  return ctx;
}

describe('lineCpFor', () => {
  test('reads the best line, an alternative, or nothing', () => {
    const ctx = contextFor();
    expect(lineCpFor(ctx, 'Bxd5')).toBe(320);
    expect(lineCpFor(ctx, 'Qc3')).toBe(10);
    expect(lineCpFor(ctx, 'Qxg5')).toBeUndefined();
  });
});

describe('realChance', () => {
  test('a capture far better than the best non-capture line is real', () => {
    expect(realChance(contextFor(), ['Bxd5'])).toEqual({ san: 'Bxd5', cpWhite: 320 });
  });

  test('a poisoned capture the engine never lists is not real', () => {
    expect(realChance(contextFor(), ['Qxg5'])).toBeNull();
  });

  test('a chance no better than the best non-chance line is not real', () => {
    const ctx = contextFor({ bestMoveSan: 'Qc3', cpBefore: 30, alternatives: [{ san: 'Bxd5', cp: 20, winPct: 51.8 }] });
    expect(realChance(ctx, ['Bxd5'])).toBeNull();
  });

  test('falls back to the played move as the reference when every engine line is a chance', () => {
    const lines = { alternatives: [{ san: 'Qc3', cp: 300, winPct: 75 }] };
    expect(realChance(contextFor({ ...lines, moveSan: 'O-O', cpAfter: 0 }), ['Bxd5', 'Qc3'])).toEqual({ san: 'Bxd5', cpWhite: 320 });
    expect(realChance(contextFor({ ...lines, moveSan: 'O-O', cpAfter: 280 }), ['Bxd5', 'Qc3'])).toBeNull();
  });

  test('with no reference at all every good move is a chance', () => {
    const ctx = contextFor({ alternatives: [{ san: 'Qc3', cp: 300, winPct: 75 }] });
    expect(realChance(ctx, ['Bxd5', 'Qc3'])).toEqual({ san: 'Bxd5', cpWhite: 320 });
  });
});

describe('missedChance', () => {
  const chance = { san: 'Bxd5', cpWhite: 320 };

  test('missed when another move was played and it cost the value', () => {
    expect(missedChance(contextFor({ moveSan: 'Qc3', cpAfter: 10 }), ['Bxd5'], chance)).toBe(true);
  });

  test('not missed when the chance was taken', () => {
    expect(missedChance(contextFor(), ['Bxd5'], chance)).toBe(false);
  });

  test('not missed when the played move is as good as the chance', () => {
    expect(missedChance(contextFor({ moveSan: 'Qc3', cpAfter: 300 }), ['Bxd5'], chance)).toBe(false);
  });
});
