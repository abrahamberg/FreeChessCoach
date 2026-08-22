import { describe, expect, test } from 'vitest';
import {
  endgameStartPly,
  isLowConfidencePhase,
  openingEndPly,
  phaseForPly,
  type PhasePosition
} from './phase-segmentation.js';

describe('openingEndPly', () => {
  test('uses the last book ply directly once it reaches 8', () => {
    expect(openingEndPly(14)).toBe(14);
  });

  test('falls back to 10 when the game left book before ply 8', () => {
    expect(openingEndPly(4)).toBe(10);
  });

  test('falls back to 10 with no book coverage at all (lastBookPly 0)', () => {
    expect(openingEndPly(0)).toBe(10);
  });

  test('caps at 30 even for very deep named theory', () => {
    expect(openingEndPly(40)).toBe(30);
  });
});

describe('endgameStartPly', () => {
  function positionsAt(fens: string[]): PhasePosition[] {
    return fens.map((fen, index) => ({ ply: index, fen }));
  }

  test('Q vs Q (8 phase units) is already the endgame', () => {
    const fen = '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1';
    expect(endgameStartPly(positionsAt([fen]), 0)).not.toBeNull();
  });

  test('R+R vs R+R (8 phase units) is the endgame', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1';
    expect(endgameStartPly(positionsAt([fen]), 0)).not.toBeNull();
  });

  test('R+R+N vs R+R+N (10 phase units) is the endgame', () => {
    const fen = 'rn2k2r/8/8/8/8/8/8/RN2K2R w - - 0 1';
    expect(endgameStartPly(positionsAt([fen]), 0)).not.toBeNull();
  });

  test('Q+N vs Q+N (10 phase units) is the endgame', () => {
    const fen = 'n2qk3/8/8/8/8/8/8/N2QK3 w - - 0 1';
    expect(endgameStartPly(positionsAt([fen]), 0)).not.toBeNull();
  });

  test('Q+R vs Q+R (12 phase units) is still the middlegame', () => {
    const fen = 'r2qk3/8/8/8/8/8/8/R2QK3 w - - 0 1';
    expect(endgameStartPly(positionsAt([fen]), 0)).toBeNull();
  });

  test('returns null when the game never reaches the endgame threshold', () => {
    const heavyFen = 'r2qk2r/8/8/8/8/8/8/R2QK2R w - - 0 1'; // Q+R+R vs Q+R+R = 16
    expect(endgameStartPly(positionsAt([heavyFen, heavyFen, heavyFen]), 0)).toBeNull();
  });

  test('is monotone — reports the first qualifying ply once material drops, not a later one', () => {
    const heavy = 'r2qk2r/8/8/8/8/8/8/R2QK2R w - - 0 1'; // 16 units
    const light = '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1'; // 8 units
    const positions = [
      { ply: 10, fen: heavy },
      { ply: 12, fen: light },
      { ply: 14, fen: heavy } // material coming back on the board doesn't undo it
    ];
    expect(endgameStartPly(positions, 0)).toBe(12);
  });

  test('§6.3 guard: forces endgameStartPly to land after openingEndPly when material vanishes inside book', () => {
    const light = '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1'; // 8 units, qualifies immediately
    const positions = [{ ply: 4, fen: light }];
    // Book ran to ply 10 (deep theory), so the raw match at ply 4 must be pushed past it.
    expect(endgameStartPly(positions, 10)).toBe(11);
  });
});

describe('phaseForPly', () => {
  const boundaries = { openingEndPly: 10, endgameStartPly: 30 };

  test('a ply at or before the opening boundary is the opening', () => {
    expect(phaseForPly(10, boundaries)).toBe('opening');
  });

  test('a ply between the two boundaries is the middlegame', () => {
    expect(phaseForPly(11, boundaries)).toBe('middlegame');
    expect(phaseForPly(29, boundaries)).toBe('middlegame');
  });

  test('a ply at or after the endgame boundary is the endgame', () => {
    expect(phaseForPly(30, boundaries)).toBe('endgame');
  });

  test('every ply is opening or middlegame when the game never reaches the endgame', () => {
    expect(phaseForPly(50, { openingEndPly: 10, endgameStartPly: null })).toBe('middlegame');
  });
});

describe('isLowConfidencePhase', () => {
  test('zero moves is not "low confidence" — callers should report null instead', () => {
    expect(isLowConfidencePhase(0)).toBe(false);
  });

  test('1-2 moves is low confidence', () => {
    expect(isLowConfidencePhase(1)).toBe(true);
    expect(isLowConfidencePhase(2)).toBe(true);
  });

  test('3 or more moves is not low confidence', () => {
    expect(isLowConfidencePhase(3)).toBe(false);
  });
});
