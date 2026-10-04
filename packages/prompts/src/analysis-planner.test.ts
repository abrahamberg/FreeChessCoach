import type { ClassifiedMove } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import { buildPlannerMessages } from './analysis-planner.js';
import { basePlannerInput } from './fixtures.js';

const userMove = (patch: Partial<ClassifiedMove>): ClassifiedMove =>
  ({ ply: 5, moveSan: 'Nf3', mover: 'white', isUserMove: true, cpLoss: 0, quality: 'good', bestLineSan: ['Nf3'], evalAfterCp: 0, hangsPiece: false, ...patch }) as ClassifiedMove;

describe('buildPlannerMessages: the habits and the review text', () => {
  test('a move where a habit failed carries it even though it cost nothing, and so does its candidate line', () => {
    const { user } = buildPlannerMessages(
      basePlannerInput({
        moves: [userMove({ ply: 5, moveSan: 'Qxd5' })],
        candidateMoments: [{ ply: 5, kind: 'focus_failure', cpLoss: 0, focusCode: 'BV-04' }]
      })
    );

    expect(user).toContain('5. Qxd5 [a habit of theirs failed here:');
    expect(user).toContain('- ply 5: focus_failure (cpLoss 0) — habit:');
    expect(user).toContain('"focus_failure"');
  });

  test('a move that did not fail a habit has no habit note', () => {
    const { user } = buildPlannerMessages(basePlannerInput({ moves: [userMove({ ply: 5 })], candidateMoments: [] }));
    expect(user).not.toContain('a habit of theirs failed');
  });

  test('a costly move shows the review\'s sentences, including a tactic card that is not in its reasons', () => {
    const { user } = buildPlannerMessages(
      basePlannerInput({
        moves: [userMove({ ply: 5, moveSan: 'h3', quality: 'mistake', cpLoss: 180, tacticAllowed: { type: 'fork', byMoveSan: 'Nc7' }, reasons: [] })],
        candidateMoments: [{ ply: 5, kind: 'user_mistake', cpLoss: 180 }]
      })
    );

    expect(user).toMatch(/5\. h3\?.*fork/);
  });

  test('the planner is told to take a habit failure before an unrelated mistake', () => {
    expect(buildPlannerMessages(basePlannerInput()).system).toContain('focus_failure');
  });
});
