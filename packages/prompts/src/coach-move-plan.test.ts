import { describe, expect, test } from 'vitest';
import { renderCoachMovePlan } from './coach-move-plan.js';

const base = { san: 'Nf3', levelElo: 1200, targetElo: 1100, performanceElo: 1350, costWinPct: null };

describe('renderCoachMovePlan', () => {
  test('names the move, the level it was picked at, and tells the coach to play it directly', () => {
    const block = renderCoachMovePlan({ ...base, kind: 'best' });
    expect(block).toContain('Planned move: Nf3');
    expect(block).toContain('about 1100 strength');
    expect(block).toContain('about 1350 this game');
    expect(block).toContain('play_coach_move');
  });

  test('a deliberate mistake says what it costs and not to give it away', () => {
    const block = renderCoachMovePlan({ ...base, kind: 'mistake', costWinPct: 14.4 });
    expect(block).toContain('deliberate mistake');
    expect(block).toContain('about 14%');
    expect(block).toContain("Don't hint at it");
  });
});
