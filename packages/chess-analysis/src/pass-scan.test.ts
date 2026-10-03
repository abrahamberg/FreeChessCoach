import { describe, expect, test } from 'vitest';
import type { EngineEval } from '@freechesscoach/shared';
import { indexPassEvals, passEvalOf, planPassScans, type PassScanWant } from './pass-scan.js';
import { gamePassScanFens } from './pass-scan-wants.js';
import { parsePgn } from './pgn.js';
import { flipActiveColorFen } from './null-move-fen.js';
import { inZugzwang } from './zugzwang-scan.js';

const GAME = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *');
const everyPly: PassScanWant = { id: 'every-ply', wants: () => true };
const alsoEveryPly: PassScanWant = { id: 'also-every-ply', wants: () => true };

function evalWith(fen: string, cp: number): EngineEval {
  return { ply: 0, fen, depth: 12, lines: [{ moveUci: 'a1a2', moveSan: 'Ra2', cp, mateIn: null }] };
}

describe('pass scan plan', () => {
  test('a ply two consumers both want is searched once', () => {
    expect(planPassScans(GAME.positions, [everyPly, alsoEveryPly])).toEqual(planPassScans(GAME.positions, [everyPly]));
  });

  test('every planned position is the flipped position after a move', () => {
    const planned = planPassScans(GAME.positions, [everyPly]);
    expect(planned).toHaveLength(GAME.positions.length - 1);
    const flipped = GAME.positions.slice(1).map((position) => flipActiveColorFen(position.fen));
    expect(planned).toEqual(flipped);
  });

  test('the shipped wants leave an opening game with nothing to scan', () => {
    expect(gamePassScanFens(GAME.positions)).toEqual([]);
  });
});

describe('zugzwang from a pass eval', () => {
  const fenAfter = '8/p7/P2k1p2/2p2P2/2p1K3/2P5/1P6/8 w - - 1 49';
  const pass = (cp: number) => indexPassEvals([evalWith(flipActiveColorFen(fenAfter)!, cp)]);

  test('the side to move is in zugzwang when passing would be much better for it', () => {
    expect(inZugzwang(fenAfter, evalWith(fenAfter, -400), pass(0))).toBe(true);
  });

  test('not when passing would not help (it is simply lost)', () => {
    expect(inZugzwang(fenAfter, evalWith(fenAfter, -400), pass(-380))).toBe(false);
  });

  test('not when there is no pass eval', () => {
    expect(inZugzwang(fenAfter, evalWith(fenAfter, -400), new Map())).toBe(false);
    expect(passEvalOf(fenAfter, new Map())).toBeNull();
  });
});
