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

  test('leaves a real miss alone when the move cost evaluation', () => {
    const played = classifyPlayedTacticAlternative({
      move: playedMove({ moveSan: 'Nd6+', quality: 'mistake', drop: 20 }),
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
