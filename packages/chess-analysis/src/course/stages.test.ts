import { parseCourseTree } from './tree.js';
import { describe, expect, test } from 'vitest';
import { COURSE_STAGES, isPracticeDone, nextCourseStage, nextPracticeState, practiceArrow, practiceAsks, practiceProgress, practiceRoundsLeft, practiceShowsArrow } from './stages.js';

describe('course stages', () => {
  test('play through, practice, drill, then the full drill', () => {
    expect(COURSE_STAGES).toEqual(['play_through', 'practice', 'drill', 'full_drill']);
    expect(nextCourseStage('play_through')).toBe('practice');
    expect(nextCourseStage('drill')).toBe('full_drill');
    expect(nextCourseStage('full_drill')).toBeNull();
  });
});

describe('practice hints', () => {
  test('the arrows fade over rounds: all, every other move, none, then the move is known', () => {
    expect(practiceShowsArrow(undefined)).toBe(true);
    const second = nextPracticeState(undefined, true);
    expect(second).toBe('some_arrow');
    expect([0, 1, 2, 3].map((index) => practiceShowsArrow(second, index))).toEqual([true, false, true, false]);
    const third = nextPracticeState(second, true);
    expect(third).toBe('no_arrow');
    expect(practiceShowsArrow(third, 0)).toBe(false);
    const known = nextPracticeState(third, true);
    expect(known).toBe('cleared');
    expect(practiceAsks(known)).toBe(false);
  });

  test('a miss turns the arrow back on', () => {
    expect(nextPracticeState('no_arrow', false)).toBe('arrow');
    expect(nextPracticeState('some_arrow', false)).toBe('arrow');
    expect(nextPracticeState(undefined, false)).toBe('arrow');
    expect(practiceShowsArrow('arrow')).toBe(true);
    expect(practiceAsks('arrow')).toBe(true);
  });

  test('done once every asked move is cleared', () => {
    const states = new Map([['a', 'cleared' as const], ['b', 'no_arrow' as const]]);
    expect(isPracticeDone(['a', 'b'], states)).toBe(false);
    expect(isPracticeDone(['a'], states)).toBe(true);
    expect(isPracticeDone([], states)).toBe(false);
  });

  test('the hint is the move itself', () => {
    const [d4] = parseCourseTree('1. d4 *').nodes;
    expect(practiceArrow(d4!)).toEqual({ from: 'd2', to: 'd4', kind: 'best' });
  });
});

describe('practice rounds', () => {
  test('three rounds when every answer is right; a miss adds rounds', () => {
    const keys = ['a', 'b'];
    expect(practiceRoundsLeft(keys, new Map())).toBe(3);
    const afterOne = new Map([['a', 'some_arrow' as const], ['b', 'some_arrow' as const]]);
    expect(practiceRoundsLeft(keys, afterOne)).toBe(2);
    expect(practiceProgress(keys, afterOne)).toBeCloseTo(1 / 3);
    const missed = new Map([['a', 'no_arrow' as const], ['b', 'arrow' as const]]);
    expect(practiceRoundsLeft(keys, missed)).toBe(3);
    expect(practiceRoundsLeft(keys, new Map([['a', 'cleared' as const], ['b', 'cleared' as const]]))).toBe(0);
  });
});
