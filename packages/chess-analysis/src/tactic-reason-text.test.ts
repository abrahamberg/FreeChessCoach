import { describe, expect, test } from 'vitest';
import { tacticOpportunityReason, tacticPreventionReason } from './tactic-reason-text.js';

describe('tacticOpportunityReason', () => {
  test('found, with a detail clause: names the tactic and drops the redundant SAN', () => {
    const text = tacticOpportunityReason({ type: 'fork', found: true, detail: 'Knight on d5 forks c7 and e7' }, 'Nd5');
    expect(text).toBe('Found the fork — Knight on d5 forks c7 and e7.');
  });

  test('found, no detail: falls back to naming the move', () => {
    const text = tacticOpportunityReason({ type: 'fork', found: true, detail: null }, 'Nd5');
    expect(text).toBe('Found the fork with Nd5.');
  });

  test('missed, with a detail clause', () => {
    const text = tacticOpportunityReason({ type: 'trappedPiece', found: false, detail: 'knight on a8 is trapped' }, 'Kf1');
    expect(text).toBe('Missed a trapped piece — knight on a8 is trapped.');
  });

  test('missed, no detail: uses "an" before a vowel-led noun', () => {
    const text = tacticOpportunityReason({ type: 'overloadedDefender', found: false, detail: null }, 'Rf1');
    expect(text).toBe('Missed an overloaded defender, available with Rf1.');
  });
});

describe('tacticPreventionReason', () => {
  test('defused: reads as an action taken', () => {
    const text = tacticPreventionReason({
      type: 'skewer',
      prevented: true,
      detail: 'skewers the knight on e4, exposing the pawn on h7'
    });
    expect(text).toBe("Defused the opponent's skewer — skewers the knight on e4, exposing the pawn on h7.");
  });

  test('not defused: reads as the threat still standing', () => {
    const text = tacticPreventionReason({ type: 'fork', prevented: false, detail: 'pawn on e5 forks d6 and f6' });
    expect(text).toBe("Left the opponent's fork in play — pawn on e5 forks d6 and f6.");
  });

  test('no detail clause when detail is absent', () => {
    const text = tacticPreventionReason({ type: 'pin', prevented: false, detail: null });
    expect(text).toBe("Left the opponent's pin in play.");
  });
});
