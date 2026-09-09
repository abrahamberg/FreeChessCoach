import { describe, expect, test } from 'vitest';
import { classifyTacticClaims, classifyTacticMotif, type TacticMotifContext } from './classify-tactic-motif.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const PIN_FEN = '4k3/8/2n5/8/8/3B4/8/4K3 w - - 0 1';
// A pinned pawn that is simply outnumbered (1 attacker, 0 defenders) but
// isn't itself doing anything — no capture of its own, nothing it guards.
const PAWN_PIN_NO_FUNCTION_DENIED_FEN = '4k3/3n4/3p4/8/7Q/8/8/K7 w - - 0 1';
// Same shape, but the pinned pawn was eyeing the knight on e5 and can no
// longer take it — the pin costs its owner a real capture.
const PAWN_PIN_DENIES_CAPTURE_FEN = '4k3/3n4/3p4/4N3/7Q/8/8/K7 w - - 0 1';
const FREE_PIECE_FEN = '7k/8/8/3q4/2B5/8/8/4K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SKEWER_FEN = 'r7/8/8/k7/8/8/8/1R5K w - - 0 1';
const DOUBLE_CHECK_FEN = '7k/8/8/4N3/8/8/8/Q6K w - - 0 1';
const OVERLOAD_FEN = '1r5k/3n4/5b2/8/8/8/4K3/1RR5 w - - 0 1';
const BACK_RANK_FEN = '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1';

function contextFor(overrides: Partial<TacticMotifContext> & Pick<TacticMotifContext, 'fenBefore' | 'moveSan'>): TacticMotifContext {
  return {
    mover: 'white',
    quality: 'best',
    isCheckmate: false,
    isTacticalPosition: true,
    ...overrides
  };
}

describe('classifyTacticMotif', () => {
  test('checkmate takes priority over every other motif', () => {
    const context = contextFor({ fenBefore: FORK_FEN, moveSan: 'Nd6+', isCheckmate: true });

    expect(classifyTacticMotif(context)).toBe('checkmate');
  });

  test('a brilliant-classified move is tagged brilliantSacrifice ahead of fork', () => {
    const context = contextFor({ fenBefore: FORK_FEN, moveSan: 'Nd6+', quality: 'brilliant' });

    expect(classifyTacticMotif(context)).toBe('brilliantSacrifice');
  });

  test('tags a fork-creating move', () => {
    const context = contextFor({ fenBefore: FORK_FEN, moveSan: 'Nd6+' });

    expect(classifyTacticMotif(context)).toBe('fork');
  });

  test('tags a pin-creating move', () => {
    const context = contextFor({ fenBefore: PIN_FEN, moveSan: 'Bb5' });

    expect(classifyTacticMotif(context)).toBe('pin');
  });

  test('drops a pawn pin that only shows the pawn is outnumbered', () => {
    // Qd4 pins d6 to the knight on d7, and the pawn has one attacker (the
    // queen) and zero defenders — the old "attackers > defenders" test alone
    // would have kept this. But the pawn isn't eyeing a capture and guards
    // nothing: it's a hanging pawn wearing a pin's geometry (TR-05's shape),
    // not a bind worth naming.
    const context = contextFor({ fenBefore: PAWN_PIN_NO_FUNCTION_DENIED_FEN, moveSan: 'Qd4' });

    expect(classifyTacticClaims(context).claims.map((claim) => claim.type)).not.toContain('pin');
  });

  test('keeps a pawn pin that costs the pawn a capture of its own', () => {
    // Same shape as above, but the pawn on d6 was attacking the knight on e5
    // and the pin takes that capture away — a real bind, not a hanging pawn.
    const context = contextFor({ fenBefore: PAWN_PIN_DENIES_CAPTURE_FEN, moveSan: 'Qd4' });

    expect(classifyTacticClaims(context).claims.map((claim) => claim.type)).toContain('pin');
  });

  test('tags capturing an undefended piece as a free piece', () => {
    const context = contextFor({ fenBefore: FREE_PIECE_FEN, moveSan: 'Bxd5' });

    expect(classifyTacticMotif(context)).toBe('freePiece');
  });

  test('tags a skewer-creating move', () => {
    const context = contextFor({ fenBefore: SKEWER_FEN, moveSan: 'Ra1+' });

    expect(classifyTacticMotif(context)).toBe('skewer');
  });

  test('tags a double-check-creating move ahead of the discovered attack it also is', () => {
    const context = contextFor({ fenBefore: DOUBLE_CHECK_FEN, moveSan: 'Nf7+' });

    expect(classifyTacticMotif(context)).toBe('doubleCheck');
  });

  test('keeps the overloaded defender among a move\'s claims, behind the file it also takes', () => {
    // Rf1 both overloads the d7 knight and swings a rook onto the open
    // f-file. Both are true; the ranker leads with the one that changes the
    // position rather than the one with the longer name, and multi-label
    // means the other is still there for the coach to reason with.
    const context = contextFor({ fenBefore: OVERLOAD_FEN, moveSan: 'Rf1' });

    expect(classifyTacticClaims(context).claims.map((claim) => claim.type)).toContain('overloadedDefender');
  });

  test('tags a move exploiting a weak back rank, checkmate flag notwithstanding', () => {
    const context = contextFor({ fenBefore: BACK_RANK_FEN, moveSan: 'Ra8#' });

    expect(classifyTacticMotif(context)).toBe('weakBackRank');
  });

  test('says nothing for a tactical position matching no named motif', () => {
    // The shipped classifier answered `'other'` here, which prints "Found the
    // tactic with e4." — a card that says a tactic happened without being
    // able to say which. docs/tactics-rework.md §3's acceptance bar rules
    // that out: no sentence ships that can't name what it wins.
    const context = contextFor({ fenBefore: QUIET_FEN, moveSan: 'e4', isTacticalPosition: true });

    expect(classifyTacticMotif(context)).toBeNull();
  });

  test('returns null outside a tactical position', () => {
    const context = contextFor({ fenBefore: QUIET_FEN, moveSan: 'e4', isTacticalPosition: false });

    expect(classifyTacticMotif(context)).toBeNull();
  });
});
