import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { hasTacticVisual, tacticSelectionOverlay, toggleTacticSelection } from './tacticSelection.js';

function baseMove(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 10,
    moveSan: 'Nxe4',
    mover: 'black',
    isUserMove: true,
    cpLoss: 0,
    quality: 'mistake',
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    ...overrides
  } as ClassifiedMoveDto;
}

describe('toggleTacticSelection', () => {
  test('selecting a new key replaces the current one', () => {
    expect(toggleTacticSelection('opportunity', 'prevention')).toBe('prevention');
    expect(toggleTacticSelection(null, 'opportunity')).toBe('opportunity');
  });

  test('re-selecting the active key clears it', () => {
    expect(toggleTacticSelection('prevention', 'prevention')).toBeNull();
  });
});

describe('hasTacticVisual', () => {
  test('false when neither tactic field has geometry', () => {
    expect(hasTacticVisual(baseMove())).toBe(false);
  });

  test('true once either field carries a visual', () => {
    expect(
      hasTacticVisual(
        baseMove({ tacticPrevention: { type: 'fork', prevented: false, visual: { arrows: [], highlights: ['e5'] } } })
      )
    ).toBe(true);
  });
});

describe('tacticSelectionOverlay', () => {
  const move = baseMove({
    tacticPrevention: {
      type: 'fork',
      prevented: false,
      detail: 'pawn on e5 forks d6 and f6',
      visual: { arrows: [{ from: 'e5', to: 'd6' }, { from: 'e5', to: 'f6' }], highlights: [] }
    },
    tacticOpportunity: {
      type: 'trappedPiece',
      found: false,
      detail: 'pawn on e4 is trapped',
      visual: { arrows: [], highlights: ['e4'] }
    }
  });

  test('null key draws nothing', () => {
    expect(tacticSelectionOverlay(move, null)).toEqual({ arrows: [], highlights: [] });
  });

  test('prevention key, not prevented: red arrows', () => {
    const overlay = tacticSelectionOverlay(move, 'prevention');
    expect(overlay.arrows).toEqual([
      { from: 'e5', to: 'd6', color: 'var(--tactic-bad)' },
      { from: 'e5', to: 'f6', color: 'var(--tactic-bad)' }
    ]);
    expect(overlay.highlights).toEqual([]);
  });

  test('opportunity key, not found: red highlight, no arrows', () => {
    const overlay = tacticSelectionOverlay(move, 'opportunity');
    expect(overlay.arrows).toEqual([]);
    expect(overlay.highlights).toEqual([{ square: 'e4', color: 'var(--tactic-bad-fill)' }]);
  });

  test('"all" key combines both', () => {
    const overlay = tacticSelectionOverlay(move, 'all');
    expect(overlay.arrows).toHaveLength(2);
    expect(overlay.highlights).toHaveLength(1);
  });

  test('a found/defused (good) outcome draws green', () => {
    const goodMove = baseMove({
      tacticOpportunity: {
        type: 'fork',
        found: true,
        detail: 'knight on d6 forks e8 and b7',
        visual: { arrows: [{ from: 'd6', to: 'e8' }], highlights: [] }
      }
    });
    const overlay = tacticSelectionOverlay(goodMove, 'opportunity');
    expect(overlay.arrows).toEqual([{ from: 'd6', to: 'e8', color: 'var(--tactic-good)' }]);
  });

  test('no move: draws nothing', () => {
    expect(tacticSelectionOverlay(undefined, 'all')).toEqual({ arrows: [], highlights: [] });
  });
});
