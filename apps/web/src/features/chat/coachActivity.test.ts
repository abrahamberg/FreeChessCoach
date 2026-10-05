import { describe, expect, test } from 'vitest';
import { activityLabel, activityOutcome, finishStep, startStep } from './coachActivity.js';

describe('coach activity', () => {
  test('a habit update names the habit and what is done to it', () => {
    expect(activityLabel('propose_focus_area_update', { diagnosisCode: 'TA-07', action: 'graduate' })).toMatch(/^Graduating habit: /);
  });

  test('a refused tool result is a failed step with its reason, a plain one is done', () => {
    expect(activityOutcome({ applied: false, reason: 'already graduated' })).toEqual({ ok: false, detail: 'already graduated' });
    expect(activityOutcome({ saved: false, reason: 'names a move' })).toEqual({ ok: false, detail: 'names a move' });
    expect(activityOutcome({ error: 'budget_exhausted' })).toEqual({ ok: false, detail: 'budget_exhausted' });
    expect(activityOutcome('fen text')).toEqual({ ok: true, detail: null });
  });

  test('only the running step with that id finishes', () => {
    const steps = [startStep('a', 'get_user_profile', {}, 100), startStep('b', 'get_player_stats', {}, 120)];
    const finished = finishStep(steps, 'a', { ok: true, detail: null }, 300);
    expect(finished.map((step) => step.status)).toEqual(['done', 'running']);
    expect(finishStep(finished, 'a', { ok: false, detail: 'x' }, 400)[0]?.endedAt).toBe(300);
  });
});
