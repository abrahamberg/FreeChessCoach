import type { ClassifiedMove } from '@freechesscoach/chess-analysis';
import type { CoachingPlan } from '@freechesscoach/shared';
import { describe, expect, it } from 'vitest';
import { keepStudentMoments, planCandidateMoments, studentPlies } from './plan-moments.js';

const move = (ply: number, isUserMove: boolean) => ({ ply, isUserMove }) as ClassifiedMove;
const moves = [move(1, false), move(2, true), move(3, false), move(4, true)];

const plan = (plies: number[]): CoachingPlan => ({
  gameSummary: 's',
  openingNote: 'o',
  themes: [],
  connectionToHistory: 'c',
  sessionGoal: 'g',
  moments: plies.map((ply) => ({ ply, kind: 'user_mistake', category: null, whatHappened: 'w', socraticQuestion: 'q', keyLine: 'k', revealDepthPlies: 4 }))
});

describe('planCandidateMoments', () => {
  it('adds a failed focus habit on a move the student played, and not on the opponent\'s', () => {
    const observations = [
      { ply: 2, code: 'BV-04', failed: true, severity: 'meaningful', reachability: 0.8 },
      { ply: 3, code: 'BV-04', failed: true, severity: 'major', reachability: 0.8 }
    ] as const;

    const moments = planCandidateMoments([], moves, observations, new Set(['BV-04']));

    expect(moments).toEqual([{ ply: 2, kind: 'focus_failure', cpLoss: 0, focusCode: 'BV-04' }]);
  });
});

describe('keepStudentMoments', () => {
  it('drops a moment on the opponent\'s move', () => {
    expect(keepStudentMoments(plan([1, 2, 3, 4]), studentPlies(moves)).moments.map((moment) => moment.ply)).toEqual([2, 4]);
  });

  it('keeps the plan as it was when none of its moments is the student\'s', () => {
    const original = plan([1, 3]);
    expect(keepStudentMoments(original, studentPlies(moves))).toBe(original);
  });
});
