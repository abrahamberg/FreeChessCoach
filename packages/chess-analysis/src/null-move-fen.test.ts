import { describe, expect, test } from 'vitest';
import { flipActiveColorFen } from './null-move-fen.js';

const OPENING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** White is in check (queen has captured to f2) — a normal, legal pre-move
 * position (white must respond), not something a null-move flip can sanely
 * ask "what if you passed" about. */
const MOVER_IN_CHECK_FEN = 'rnb1k1nr/pppp1ppp/8/2b5/4P3/8/PPPP1qPP/RNBQKBNR w KQkq - 0 3';
const EP_ELIGIBLE_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

describe('flipActiveColorFen', () => {
  test('flips the active-color field, preserving castling/halfmove/fullmove', () => {
    expect(flipActiveColorFen(OPENING_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
  });

  test('returns null when the side to move is in check', () => {
    expect(flipActiveColorFen(MOVER_IN_CHECK_FEN)).toBeNull();
  });

  test('clears the en-passant field on flip', () => {
    expect(flipActiveColorFen(EP_ELIGIBLE_FEN)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
  });
});
