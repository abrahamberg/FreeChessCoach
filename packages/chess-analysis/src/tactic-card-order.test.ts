import { describe, expect, test } from 'vitest';
import { opportunityLeadsCard, orderTacticCards } from './tactic-card-order.js';

const QUEEN = { kind: 'material', pawns: 9, prize: 'queen' } as const;
const BISHOP = { kind: 'material', pawns: 3, prize: 'bishop' } as const;
const BIND = { kind: 'positional', pawns: 0, prize: null } as const;

describe('orderTacticCards', () => {
  test('a blunder opens with what it missed, not with what it happened to stop', () => {
    const order = orderTacticCards({
      quality: 'blunder',
      tacticOpportunity: { found: false, gain: QUEEN },
      tacticPrevention: { prevented: true, gain: BISHOP }
    });

    expect(order).toEqual(['allowed', 'opportunity', 'prevention']);
  });

  test('the missed chance leads a costly move even when it names no prize', () => {
    expect(
      opportunityLeadsCard({
        quality: 'mistake',
        tacticOpportunity: { found: false, gain: BIND },
        tacticPrevention: { prevented: true, gain: BISHOP }
      })
    ).toBe(true);
  });

  test('the bigger prize leads on a move that cost nothing', () => {
    expect(
      opportunityLeadsCard({
        quality: 'best',
        tacticOpportunity: { found: true, gain: QUEEN },
        tacticPrevention: { prevented: true, gain: BISHOP }
      })
    ).toBe(true);
  });

  test('a good move keeps prevention first when nothing outranks it', () => {
    expect(
      orderTacticCards({
        quality: 'good',
        tacticOpportunity: { found: true, gain: BIND },
        tacticPrevention: { prevented: true, gain: BISHOP }
      })
    ).toEqual(['allowed', 'prevention', 'opportunity']);
  });

  test('what the move handed over opens the card, ahead of both', () => {
    const order = orderTacticCards({
      quality: 'blunder',
      tacticAllowed: { gain: QUEEN },
      tacticOpportunity: { found: false, gain: BISHOP },
      tacticPrevention: { prevented: true, gain: BISHOP }
    });

    expect(order[0]).toBe('allowed');
  });

  test('an equally priced pair keeps the order the cards have always had', () => {
    expect(
      opportunityLeadsCard({
        quality: 'excellent',
        tacticOpportunity: { found: true, gain: BISHOP },
        tacticPrevention: { prevented: true, gain: BISHOP }
      })
    ).toBe(false);
  });

  test('an unpriced card never outranks one that names a prize', () => {
    expect(
      opportunityLeadsCard({
        quality: 'good',
        tacticOpportunity: { found: true },
        tacticPrevention: { prevented: true, gain: BISHOP }
      })
    ).toBe(false);
  });

  test('the only card there is leads', () => {
    expect(opportunityLeadsCard({ quality: 'good', tacticOpportunity: { found: false, gain: QUEEN } })).toBe(true);
    expect(opportunityLeadsCard({ quality: 'good', tacticPrevention: { prevented: true, gain: QUEEN } })).toBe(false);
  });
});
