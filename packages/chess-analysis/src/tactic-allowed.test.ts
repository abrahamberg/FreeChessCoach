import { describe, expect, test } from 'vitest';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { computeTacticAllowed } from './tactic-allowed.js';

const QUEEN = { kind: 'material', pawns: 9, prize: 'queen' } as const;
const BIND = { kind: 'positional', pawns: 0, prize: null } as const;

function move(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 18,
    moveSan: 'Qd7',
    mover: 'black',
    isUserMove: false,
    cpLoss: 0,
    quality: 'blunder',
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    ...overrides
  } as ClassifiedMoveDto;
}

/** The reply that punishes it, as the next ply's own card already describes
 * it. */
function reply(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return move({
    ply: 19,
    moveSan: 'Bxf6',
    mover: 'white',
    isUserMove: true,
    quality: 'inaccuracy',
    bestMoveSan: 'Bb5',
    tacticOpportunity: {
      type: 'trappedPiece',
      found: false,
      detail: 'queen on d7 is trapped',
      visual: { arrows: [{ from: 'c4', to: 'b5' }], highlights: ['d7'] },
      gain: QUEEN,
      confidence: 0.8,
      embodiedBySan: 'Bb5'
    },
    ...overrides
  });
}

describe('computeTacticAllowed', () => {
  test('names what the move handed over, from the reply that collects it', () => {
    expect(computeTacticAllowed(move(), reply())).toEqual({
      type: 'trappedPiece',
      detail: 'queen on d7 is trapped',
      visual: { arrows: [{ from: 'c4', to: 'b5' }], highlights: ['d7'] },
      gain: QUEEN,
      confidence: 0.8,
      byMoveSan: 'Bb5'
    });
  });

  test('says nothing about a move that cost nothing', () => {
    // The tactic was in the position, not in the move — the opponent's own
    // card is where it belongs.
    for (const quality of ['best', 'great', 'excellent', 'good', 'book'] as const) {
      expect(computeTacticAllowed(move({ quality }), reply())).toBeUndefined();
    }
  });

  test('says nothing when what became available wins no material', () => {
    const positional = reply({
      tacticOpportunity: { type: 'pin', found: false, detail: 'a bind', visual: null, gain: BIND }
    });
    expect(computeTacticAllowed(move(), positional)).toBeUndefined();
  });

  test('says nothing on the last move of the game, or when the reply has no card', () => {
    expect(computeTacticAllowed(move(), undefined)).toBeUndefined();
    expect(computeTacticAllowed(move(), reply({ tacticOpportunity: undefined }))).toBeUndefined();
  });

  test('names the reply the opponent actually found, when they found one of their own', () => {
    const found = reply({
      tacticOpportunity: {
        type: 'fork',
        found: true,
        detail: 'knight on f6 forks d7 and h7',
        visual: null,
        gain: QUEEN,
        embodiedBySan: 'Nxf6+'
      }
    });
    expect(computeTacticAllowed(move(), found)?.byMoveSan).toBe('Nxf6+');
  });
});
