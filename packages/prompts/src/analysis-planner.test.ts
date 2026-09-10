import { describe, expect, test } from 'vitest';
import { MISTAKE_CATEGORIES } from '@freechesscoach/shared';
import { buildPlannerMessages } from './analysis-planner.js';
import { basePlannerInput as baseInput } from './fixtures.js';

describe('buildPlannerMessages', () => {
  test('system prompt lists all 13 categories and the moment-selection rules', () => {
    const { system } = buildPlannerMessages(baseInput());
    for (const category of MISTAKE_CATEGORIES) {
      expect(system).toContain(category);
    }
    expect(system).toContain('SELECT 4–8 moments');
  });

  test('user message includes only the student\'s (white) moves in the moves table', () => {
    const { user } = buildPlannerMessages(baseInput());
    expect(user).toContain('h3');
    expect(user).toContain('mistake');
    expect(user).toContain('180');
  });

  test('an unsound move\'s pre-computed reasons are included in the moves table', () => {
    const { user } = buildPlannerMessages(baseInput());
    expect(user).toContain('Leaves the knight on d5 undefended');
  });

  test('a sound move with no reasons renders no trailing "; " noise', () => {
    const { user } = buildPlannerMessages(baseInput());
    expect(user).toContain('1. e4 | best line: e4 e5');
  });

  test('user message includes the pre-computed candidate moments', () => {
    const { user } = buildPlannerMessages(baseInput());
    expect(user).toContain('user_mistake');
    expect(user).toMatch(/ply\s*3|3.*user_mistake/i);
  });

  test('empty focus areas render the "(none yet…)" fallback', () => {
    const { user } = buildPlannerMessages(baseInput({ focusAreas: [] }));
    expect(user).toContain('none yet');
  });

  test('embeds band, self-assessment, and userColor', () => {
    const { user } = buildPlannerMessages(baseInput());
    expect(user).toContain('Club');
    expect(user).toContain('I blunder pieces');
    expect(user).toContain('white');
  });

  test('renders the "this game vs their usual" comparison when the caller has one', () => {
    const { user } = buildPlannerMessages(baseInput({ playerStats: 'Baseline: 12 recent rapid games (this game excluded).' }));

    expect(user).toContain('THIS GAME VS THEIR USUAL');
    expect(user).toContain('Baseline: 12 recent rapid games');
  });

  test('drops the comparison section entirely when there is none, rather than showing an empty heading', () => {
    const { user } = buildPlannerMessages(baseInput());

    expect(user).not.toContain('THIS GAME VS THEIR USUAL');
  });

  test('the system prompt makes sessionGoal the first decision, weighted to measured evidence over this one game', () => {
    const { system, user } = buildPlannerMessages(baseInput());

    expect(system).toContain('SET ONE GOAL FIRST (sessionGoal)');
    expect(system).toContain('one game is the weakest evidence you have');
    // The output schema is rendered into the user message, next to the data.
    expect(user).toContain('"sessionGoal": string');
  });
});
