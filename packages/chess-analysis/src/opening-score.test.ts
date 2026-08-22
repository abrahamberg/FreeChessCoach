import { describe, expect, test } from 'vitest';
import { bookDepthScore, developmentScore, openingScore } from './opening-score.js';
import { parsePgn } from './pgn.js';

describe('bookDepthScore', () => {
  test('8 full moves (ply 16) of book coverage is a full score', () => {
    expect(bookDepthScore(16)).toBe(100);
  });

  test('scales linearly below the full-score depth', () => {
    expect(bookDepthScore(8)).toBe(50);
  });

  test('no book coverage scores 0', () => {
    expect(bookDepthScore(0)).toBe(0);
  });

  test('clamps above the full-score depth', () => {
    expect(bookDepthScore(24)).toBe(100);
  });
});

describe('openingScore', () => {
  test('applies the §7.1 weighted sum', () => {
    const result = openingScore({ openingAccuracy: 80, bookDepthScore: 100, developmentScore: 60 });
    // 0.55*80 + 0.20*100 + 0.25*60 = 44 + 20 + 15 = 79
    expect(result).toBeCloseTo(79, 5);
  });

  test('propagates a null opening accuracy rather than scoring from partial data', () => {
    expect(openingScore({ openingAccuracy: null, bookDepthScore: 100, developmentScore: 100 })).toBeNull();
  });

  test('clamps to 100', () => {
    const result = openingScore({ openingAccuracy: 100, bookDepthScore: 100, developmentScore: 100 });
    expect(result).toBe(100);
  });
});

describe('developmentScore', () => {
  test('a fully developed, castled opening scores near the top', () => {
    const game = parsePgn(
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6'
    );
    const score = developmentScore({ positions: game.positions, color: 'white', openingEndPly: 7 });
    // castled (+25) + 2 developed minors (+20) + likely center advantage (+15)
    // + no repeated moves (+10) + only 1 pawn move so far (+10) = 80
    expect(score).toBe(80);
  });

  test('an uncastled, undeveloped opening scores far lower than the developed one', () => {
    const game = parsePgn('1. h4 h5 2. a4 a5 3. g4 g5');
    const score = developmentScore({ positions: game.positions, color: 'white', openingEndPly: 5 });
    expect(score).toBeLessThan(40);
  });

  test('moving the same minor piece twice without a capture forfeits the no-repeat bonus', () => {
    const developed = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5');
    const repeated = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Bd3 Bb4');

    const developedScore = developmentScore({ positions: developed.positions, color: 'white', openingEndPly: 5 });
    const repeatedScore = developmentScore({ positions: repeated.positions, color: 'white', openingEndPly: 7 });

    expect(repeatedScore).toBe(developedScore - 10);
  });

  test('all 5 development bonuses stack to exactly 100 when every condition is met', () => {
    const game = parsePgn('1. Nf3 Nf6 2. Nc3 Nc6 3. b3 b6 4. Bb2 Bb7 5. e3 e6 6. Be2 Be7');
    const score = developmentScore({ positions: game.positions, color: 'white', openingEndPly: 11 });
    // All 4 minors developed (+40, at the 40-point cap), king safe with a
    // connected h1 rook though never literally castled (+25), white ahead on
    // center control (+15), no piece moved twice (+10), only 2 pawn moves
    // (+10) = 100.
    expect(score).toBe(100);
  });

  test('more than one extra pawn move beyond necessary forfeits the pawn-discipline bonus', () => {
    const disciplined = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5');
    const sprawling = parsePgn('1. e4 e5 2. a4 a5 3. b4 b5 4. c4 c5 5. d4 d5');

    const disciplinedScore = developmentScore({ positions: disciplined.positions, color: 'white', openingEndPly: 5 });
    const sprawlingScore = developmentScore({ positions: sprawling.positions, color: 'white', openingEndPly: 9 });

    expect(sprawlingScore).toBeLessThan(disciplinedScore);
  });
});
