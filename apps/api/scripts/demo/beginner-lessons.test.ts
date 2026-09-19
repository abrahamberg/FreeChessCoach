import { MISTAKE_CATEGORIES } from '@freechesscoach/shared';
import { describe, expect, it } from 'vitest';
import { BEGINNER_LESSONS, buildFindingSpecs } from './beginner-lessons.js';
import { REAL_GAMES, REAL_GAME_KEYS } from './real-games.js';

describe('beginner lessons', () => {
  it('has eight lessons, oldest first, each on a different day', () => {
    expect(BEGINNER_LESSONS).toHaveLength(8);
    const days = BEGINNER_LESSONS.map((lesson) => lesson.daysAgo);
    expect(days).toEqual([...days].sort((a, b) => b - a));
    expect(new Set(days).size).toBe(8);
  });

  it('puts each real game\'s lesson on the day that game was played, with its own result', () => {
    for (const real of REAL_GAMES) {
      const lessons = BEGINNER_LESSONS.filter((lesson) => lesson.game === real.key);
      expect(lessons, real.key).toHaveLength(1);
      expect(lessons[0]!.daysAgo, real.key).toBe(real.daysAgo);
    }
    expect(REAL_GAME_KEYS.length).toBe(REAL_GAMES.length);
  });

  it('mixes wins and losses', () => {
    expect(BEGINNER_LESSONS.filter((lesson) => lesson.result === 'win')).toHaveLength(4);
  });
});

describe('buildFindingSpecs', () => {
  const specs = buildFindingSpecs();

  it('only uses real mistake categories', () => {
    for (const spec of specs) expect(MISTAKE_CATEGORIES).toContain(spec.category);
  });

  it('puts exactly the intended counts in the last 5 and last 20 games', () => {
    const count = (category: string, within: number) => specs.filter((spec) => spec.category === category && spec.gameFromNewest < within).length;
    expect(count('hanging_piece', 20)).toBe(9);
    expect(count('hanging_piece', 5)).toBe(2);
    expect(count('missed_tactic', 5)).toBe(2);
    expect(count('opening_knowledge', 5)).toBe(0);
  });
});
