import { describe, expect, test } from 'vitest';
import { tacticOpportunityReason, tacticPreventionReason } from './tactic-reason-text.js';

/**
 * Layer 4 of `docs/tactics-rework.md` §5. The three things being asserted
 * here are the three things §3 says the shipped copy got wrong: the payoff
 * leads the sentence, the subject is the reader rather than the mover, and
 * specificity has to be earned by confidence.
 */
const WON_A_ROOK = { kind: 'material', pawns: 5, prize: 'rook' } as const;

describe('tacticOpportunityReason', () => {
  test('leads with what the tactic won, and names the motif as a subordinate clause', () => {
    const text = tacticOpportunityReason(
      { type: 'fork', found: true, isUserMove: true, gain: WON_A_ROOK, confidence: 0.85, detail: 'knight on d5 forks c7 and e7' },
      'Nd5'
    );
    expect(text).toBe('You won a rook through a fork — knight on d5 forks c7 and e7.');
  });

  test('addresses the reader as "They" on an opponent move', () => {
    // The bug this replaces: every card said "Found the fork" as though the
    // reader had played it, on both sides' moves.
    const text = tacticOpportunityReason(
      { type: 'fork', found: true, isUserMove: false, gain: WON_A_ROOK, confidence: 0.85, detail: 'knight on d5 forks c7 and e7' },
      'Nd5'
    );
    expect(text.startsWith('They won a rook')).toBe(true);
  });

  test('drops the squares at medium confidence and keeps the claim', () => {
    const text = tacticOpportunityReason(
      { type: 'fork', found: true, isUserMove: true, gain: WON_A_ROOK, confidence: 0.5, detail: 'knight on d5 forks c7 and e7' },
      'Nd5'
    );
    expect(text).toBe('You won a rook through a fork.');
  });

  test('falls back to the motif itself when the claim has no material to name', () => {
    const text = tacticOpportunityReason(
      { type: 'pin', found: true, isUserMove: true, gain: { kind: 'positional', pawns: 0, prize: null }, confidence: 0.5 },
      'Bb5'
    );
    expect(text).toBe('You pinned a piece.');
  });

  test('a mate claim says so instead of inventing a prize', () => {
    const text = tacticOpportunityReason(
      { type: 'weakBackRank', found: true, isUserMove: true, gain: { kind: 'mate', pawns: 0, prize: null }, confidence: 0.9 },
      'Ra8'
    );
    expect(text).toBe('You forced mate through a back-rank tactic.');
  });

  test('says how far off the payoff was, when the line said', () => {
    // docs/tactics-rework.md §3 rule 5: "an *eventual* fork" is what makes a
    // deep tactic honest instead of confusing.
    const soon = tacticOpportunityReason(
      { type: 'fork', found: true, isUserMove: true, gain: WON_A_ROOK, confidence: 0.9, horizon: 'inTwo' },
      'Nd5'
    );
    const far = tacticOpportunityReason(
      { type: 'fork', found: true, isUserMove: true, gain: WON_A_ROOK, confidence: 0.9, horizon: 'eventual' },
      'Nd5'
    );

    expect(soon).toBe('You won a rook through a fork two moves away.');
    expect(far).toBe('You won a rook through an eventual fork.');
  });

  test('missed: the same payoff in the infinitive, with the move that was there', () => {
    const text = tacticOpportunityReason(
      { type: 'fork', found: false, isUserMove: true, gain: WON_A_ROOK, confidence: 0.85 },
      'Nd5'
    );
    expect(text).toBe('You missed a chance to win a rook through a fork with Nd5.');
  });

  test('a report stored before the voice rewrite keeps its own mover-neutral wording', () => {
    // No `isUserMove` means no honest pronoun, and guessing one is what
    // produced the wrong copy in the first place.
    const text = tacticOpportunityReason({ type: 'fork', found: true, detail: 'knight on d5 forks c7 and e7' }, 'Nd5');
    expect(text).toBe('Found the fork — knight on d5 forks c7 and e7.');
  });

  test('a missed card names the geometry too, when the claim earned it', () => {
    const text = tacticOpportunityReason(
      { type: 'fork', found: false, isUserMove: true, gain: WON_A_ROOK, confidence: 0.85, detail: 'knight on d5 forks c7 and e7' },
      'Nd5'
    );
    expect(text).toBe('You missed a chance to win a rook through a fork with Nd5 — knight on d5 forks c7 and e7.');
  });

  test('a stored report with no detail still names the move', () => {
    expect(tacticOpportunityReason({ type: 'fork', found: true, detail: null }, 'Nd5')).toBe('Found the fork with Nd5.');
    expect(tacticOpportunityReason({ type: 'overloadedDefender', found: false, detail: null }, 'Rf1')).toBe(
      'Missed an overloaded defender, available with Rf1.'
    );
  });
});

describe('tacticPreventionReason', () => {
  test('a threat you defused is told as something you did to them', () => {
    const text = tacticPreventionReason({
      type: 'skewer',
      prevented: true,
      isUserMove: true,
      gain: WON_A_ROOK,
      detail: 'skewers the knight on e4, exposing the rook on h7'
    });
    expect(text).toBe('You stopped them winning a rook through a skewer — skewers the knight on e4, exposing the rook on h7.');
  });

  test('a threat of yours that they defused is told as your lost chance', () => {
    // docs/tactics-rework.md §3 rule 4. The shipped copy said "Defused the
    // opponent's fork" here — a log line about a third party, on a move the
    // opponent made, in a review written to the reader.
    const text = tacticPreventionReason({ type: 'fork', prevented: true, isUserMove: false, gain: WON_A_ROOK });
    expect(text).toBe('Their move stopped you winning a rook through a fork.');
  });

  test('a threat still standing belongs to whoever did not just move', () => {
    expect(tacticPreventionReason({ type: 'fork', prevented: false, isUserMove: true, gain: WON_A_ROOK })).toBe(
      'They can still win a rook through a fork.'
    );
    expect(tacticPreventionReason({ type: 'fork', prevented: false, isUserMove: false, gain: WON_A_ROOK })).toBe(
      'You can still win a rook through a fork.'
    );
  });

  test('a report stored before the voice rewrite keeps its own wording', () => {
    expect(tacticPreventionReason({ type: 'pin', prevented: false, detail: null })).toBe("Left the opponent's pin in play.");
    expect(tacticPreventionReason({ type: 'skewer', prevented: true, detail: 'skewers the knight on e4' })).toBe(
      "Defused the opponent's skewer — skewers the knight on e4."
    );
  });
});
