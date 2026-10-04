import type { CandidateMoment, ClassifiedMove } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildLocalCoachingPlan } from './local-coaching-plan.js';

function move(overrides: Partial<ClassifiedMoveDto> & { ply: number; mover: 'white' | 'black' }): ClassifiedMove {
  return {
    moveSan: 'e4',
    isUserMove: true,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    ...overrides
  } as ClassifiedMoveDto;
}

/**
 * A local (LM Studio/Ollama) setup skips the real planner LLM call
 * (this file's own doc comment) and used to leave `sessionGoal` blank —
 * coach-system.ts's `suggestedGoalLine` then rendered nothing at all, so a
 * small local model had no durable, restated-every-turn anchor for what the
 * session was actually for, only its own one-off statement of it buried in
 * the conversation. These lock in that `sessionGoal` is now always a
 * concrete, non-empty sentence whenever there's at least one picked moment.
 */
describe('buildLocalCoachingPlan sessionGoal', () => {
  test('mostly user-mistake moments: names the threat-response goal', () => {
    const candidates: CandidateMoment[] = [
      { ply: 13, kind: 'user_mistake', cpLoss: 300 },
      { ply: 21, kind: 'user_mistake', cpLoss: 250 }
    ];
    const moves = [move({ ply: 13, mover: 'black', quality: 'blunder' }), move({ ply: 21, mover: 'black', quality: 'mistake' })];

    const plan = buildLocalCoachingPlan(moves, candidates);

    expect(plan.sessionGoal).toContain('threat');
  });

  test('a turning point among the picks: names the evaluation-swing goal', () => {
    const candidates: CandidateMoment[] = [
      { ply: 13, kind: 'instructive', cpLoss: 0 },
      { ply: 21, kind: 'turning_point', cpLoss: 400 }
    ];
    const moves = [move({ ply: 13, mover: 'black', quality: 'great' }), move({ ply: 21, mover: 'white', quality: 'best' })];

    const plan = buildLocalCoachingPlan(moves, candidates);

    expect(plan.sessionGoal).toContain('swung');
  });

  test('no candidates at all: falls back to the worst user move with a generic goal, never empty', () => {
    const moves = [move({ ply: 5, mover: 'black', quality: 'blunder', cpLoss: 400 })];

    const plan = buildLocalCoachingPlan(moves, []);

    expect(plan.moments).toHaveLength(1);
    expect(plan.sessionGoal.length).toBeGreaterThan(0);
  });
});

describe('buildLocalCoachingPlan with a habit failure', () => {
  test('a move where a habit failed outranks the turning points that crowd the five moments, however little it cost', () => {
    const turning: CandidateMoment[] = [20, 22, 24, 26, 28].map((ply) => ({ ply, kind: 'turning_point', cpLoss: 400 }));
    const candidates: CandidateMoment[] = [...turning, { ply: 30, kind: 'focus_failure', cpLoss: 0, focusCode: 'BV-04' }];
    const moves = [...[20, 22, 24, 26, 28, 30].map((ply) => move({ ply, mover: ply % 2 === 0 ? 'black' : 'white' }))];

    const plan = buildLocalCoachingPlan(moves, candidates);

    expect(plan.moments).toHaveLength(5);
    expect(plan.moments.find((moment) => moment.ply === 30)?.kind).toBe('focus_failure');
    expect(plan.moments.find((moment) => moment.ply === 28)).toBeUndefined();
  });
});

