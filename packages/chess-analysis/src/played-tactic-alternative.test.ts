import { describe, expect, test } from 'vitest';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { classifyTacticClaims } from './classify-tactic-motif.js';
import { classifyPlayedTacticAlternative } from './played-tactic-alternative.js';

/** White to move, two tactics on the board: Ne4-d6+ forks the king on e8 and
 * the rook on b7, and Bd3-b5 pins the c6 knight to the same king. Shared with
 * game-tactic-motifs.test.ts, which drives the same pair through the
 * opportunity card. */
const MULTI_MOTIF_FEN = '4k3/1r6/2n5/8/P3N3/3B4/8/K7 w - - 0 1';

function playedMove(overrides: Partial<ClassifiedMoveDto> & Pick<ClassifiedMoveDto, 'moveSan'>): ClassifiedMoveDto {
  return {
    ply: 1,
    quality: 'excellent',
    drop: 0,
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: MULTI_MOTIF_FEN,
    isTacticalPosition: true,
    ...overrides
  };
}

function claimsFor(moveSan: string) {
  return classifyTacticClaims({
    fenBefore: MULTI_MOTIF_FEN,
    moveSan,
    mover: 'white',
    quality: 'best',
    isCheckmate: false,
    isTacticalPosition: true
  });
}

describe('classifyPlayedTacticAlternative', () => {
  test('names the tactic the player actually played when their move gave up nothing', () => {
    const played = classifyPlayedTacticAlternative({
      move: playedMove({ moveSan: 'Nd6+' }),
      evals: [],
      best: claimsFor('Bb5'),
      previous: null
    });

    expect(played?.headline).toBe('fork');
  });

  test('a move that actually took the material is not a miss, whatever else it cost', () => {
    // A royal fork takes the queen even on a move the engine scores worse
    // than its own: "you missed a chance to win a queen" is simply false on
    // the move that won it. What the move cost is the blunder badge's job,
    // and tactic-allowed.ts's.
    const played = classifyPlayedTacticAlternative({
      move: playedMove({ moveSan: 'Nd6+', quality: 'mistake', drop: 20 }),
      evals: [],
      best: claimsFor('Bb5'),
      previous: null
    });

    expect(played?.headline).toBe('fork');
  });

  test('leaves a real miss alone when the move that cost evaluation won nothing', () => {
    const played = classifyPlayedTacticAlternative({
      move: playedMove({ moveSan: 'Kb1', quality: 'mistake', drop: 20 }),
      evals: [],
      best: claimsFor('Bb5'),
      previous: null
    });

    expect(played).toBeNull();
  });

  test('leaves a real miss alone when the move passed up the bigger tactic', () => {
    // Free of charge — Kb1 costs nothing — but the fork it walked past wins a
    // rook, and no claim a king step carries is worth that.
    const played = classifyPlayedTacticAlternative({
      move: playedMove({ moveSan: 'Kb1' }),
      evals: [],
      best: claimsFor('Nd6+'),
      previous: null
    });

    expect(played).toBeNull();
  });

  test('two ways to win the same queen are not a miss of one of them', () => {
    // A royal fork (Nxf6+, priced by SEE at 5.8) against the engine's own pin
    // on the same queen (line-walked at 6.0). Which of the two the card names
    // must not turn on that rounding — `equalPrizeTolerancePawns`.
    const ROYAL_FORK = 'r1b1kbr1/pp1q1p1p/3p1p2/3N4/2B1P3/3Q4/PPP2PPP/R4RK1 w kq - 0 13';
    const best = classifyTacticClaims({
      fenBefore: ROYAL_FORK,
      moveSan: 'Bb5',
      mover: 'white',
      quality: 'best',
      isCheckmate: false,
      isTacticalPosition: true,
      pvSan: ['Bb5', 'Qxb5', 'Qxb5+']
    });

    const played = classifyPlayedTacticAlternative({
      move: playedMove({ moveSan: 'Nxf6+', quality: 'inaccuracy', drop: 6, fenBefore: ROYAL_FORK, ply: 25 }),
      evals: [],
      best,
      previous: null
    });

    expect(played?.headline).toBe('fork');
  });

  test('a missed mate stays missed, however much material the move won', () => {
    const mate = classifyTacticClaims({
      fenBefore: MULTI_MOTIF_FEN,
      moveSan: 'Nd6+',
      mover: 'white',
      quality: 'best',
      isCheckmate: false,
      isTacticalPosition: true
    });
    // Nothing short of mate is "as much" — and the pawn-weighted comparison
    // would happily rank a won queen above it.
    const forcedMate = { ...mate, claims: mate.claims.map((claim) => ({ ...claim, gainKind: 'mate' as const })) };

    expect(
      classifyPlayedTacticAlternative({
        move: playedMove({ moveSan: 'Bb5' }),
        evals: [],
        best: forcedMate,
        previous: null
      })
    ).toBeNull();
  });

  test('says nothing about a move with no stored position to replay', () => {
    expect(
      classifyPlayedTacticAlternative({
        move: playedMove({ moveSan: 'Nd6+', fenBefore: undefined }),
        evals: [],
        best: claimsFor('Bb5'),
        previous: null
      })
    ).toBeNull();
  });
});
