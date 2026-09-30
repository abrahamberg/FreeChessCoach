import { describe, expect, test } from 'vitest';
import { cardFits, type CardFitContext } from './tactic-claim-fit.js';

const quiet: CardFitContext = { moveSan: 'Nf3', mover: 'white', phase: 'middlegame', isCheckmate: false, mateAhead: false };
const mate = { kind: 'mate' };
const material = { kind: 'material' };

describe('which cards fit the move they are about', () => {
  test('no space claim for a pawn race: an endgame, or the sixth rank and past it', () => {
    expect(cardFits({ type: 'spaceGain' }, quiet)).toBe(true);
    expect(cardFits({ type: 'spaceGain' }, { ...quiet, phase: 'endgame' })).toBe(false);
    expect(cardFits({ type: 'spaceGain' }, { ...quiet, moveSan: 'f6' })).toBe(false);
    expect(cardFits({ type: 'spaceGain' }, { ...quiet, moveSan: 'f3', mover: 'black' })).toBe(false);
    expect(cardFits({ type: 'spaceGain' }, { ...quiet, moveSan: 'f6', mover: 'black' })).toBe(true);
  });

  test('no defensive motif on a check', () => {
    expect(cardFits({ type: 'defendsHangingPiece' }, { ...quiet, moveSan: 'Qd8+' })).toBe(false);
    expect(cardFits({ type: 'defendsHangingPiece' }, quiet)).toBe(true);
    expect(cardFits({ type: 'fork' }, { ...quiet, moveSan: 'Nc6+' })).toBe(true);
  });

  test('on a mate, or with a mate ahead, only a card about the mate', () => {
    expect(cardFits({ type: 'fork', gain: material }, { ...quiet, isCheckmate: true })).toBe(false);
    expect(cardFits({ type: 'checkmate', gain: mate }, { ...quiet, isCheckmate: true })).toBe(true);
    expect(cardFits({ type: 'seizesOpenFile' }, { ...quiet, mateAhead: true })).toBe(false);
    expect(cardFits({ type: 'fork', gain: mate }, { ...quiet, mateAhead: true })).toBe(true);
  });
});
