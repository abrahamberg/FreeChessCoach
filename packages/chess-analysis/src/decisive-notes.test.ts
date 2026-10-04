import { describe, expect, it } from 'vitest';
import { hasDecisiveNote, withoutClutterBesideDecisive } from './decisive-notes.js';

const allowed = (gain: { kind: 'material' | 'mate'; pawns: number; prize: string | null }) => ({ quality: 'blunder' as const, tacticAllowed: { type: 'trappedPiece', found: true, gain } as never });

describe('notes beside a decisive fault', () => {
  it('is decisive for a mate or a piece, not a pawn, and only on a fault', () => {
    expect(hasDecisiveNote(allowed({ kind: 'material', pawns: 9, prize: 'queen' }))).toBe(true);
    expect(hasDecisiveNote(allowed({ kind: 'mate', pawns: 0, prize: null }))).toBe(true);
    expect(hasDecisiveNote(allowed({ kind: 'material', pawns: 1, prize: 'pawn' }))).toBe(false);
    expect(hasDecisiveNote({ ...allowed({ kind: 'material', pawns: 9, prize: 'queen' }), quality: 'good' })).toBe(false);
  });

  it('drops the pawn note and the repeated loose piece, keeps the cause', () => {
    const plain = ['Leaves the pawn on h7 undefended', 'Rde8 keeps the pawn on h7 safe; after it White has a knight for a bishop', 'Leaves the rook on f8 where it can be won', 'Stopped guarding the knight on c5'];
    const decisive = ['You let them win a rook through a free piece with Rxf8 — captures the rook on f8.'];
    expect(withoutClutterBesideDecisive(plain, decisive)).toEqual(['Stopped guarding the knight on c5']);
  });
});
