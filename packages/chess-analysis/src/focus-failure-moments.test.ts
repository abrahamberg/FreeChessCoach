import type { DiagnosisCodeId } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import type { CandidateMoment } from './critical-moments.js';
import { addFocusFailureMoments, type FocusObservation } from './focus-failure-moments.js';

const focus = new Set<DiagnosisCodeId>(['BV-04']);
const mine = new Set([20, 22, 24, 26, 28, 30]);
const failure = (ply: number, code: DiagnosisCodeId = 'BV-04', patch: Partial<FocusObservation> = {}): FocusObservation => ({
  ply,
  code,
  failed: true,
  severity: 'meaningful',
  reachability: 0.7,
  ...patch
});

describe('addFocusFailureMoments', () => {
  test('a failed habit on a move that cost nothing becomes a candidate, of that habit only', () => {
    const moments = addFocusFailureMoments([], [failure(22), failure(24, 'TA-07')], focus, mine);
    expect(moments).toEqual([{ ply: 22, kind: 'focus_failure', cpLoss: 0, focusCode: 'BV-04' }]);
  });

  test('a habit that held, a habit that is not a focus area and a move that is not the student\'s add nothing', () => {
    const moments = addFocusFailureMoments([], [failure(22, 'BV-04', { failed: false }), failure(23), failure(24, 'TA-07')], focus, mine);
    expect(moments).toEqual([]);
  });

  test('a ply that is already a mistake keeps that kind and gains the habit', () => {
    const existing: CandidateMoment[] = [{ ply: 22, kind: 'user_mistake', cpLoss: 180 }];
    expect(addFocusFailureMoments(existing, [failure(22)], focus, mine)).toEqual([{ ply: 22, kind: 'user_mistake', cpLoss: 180, focusCode: 'BV-04' }]);
  });

  test('a turning point on the ply gives way to the habit', () => {
    const existing: CandidateMoment[] = [{ ply: 22, kind: 'turning_point', cpLoss: 90 }];
    expect(addFocusFailureMoments(existing, [failure(22)], focus, mine)).toEqual([{ ply: 22, kind: 'focus_failure', cpLoss: 0, focusCode: 'BV-04' }]);
  });

  test('no more than the cap are added, the most severe and reachable first, returned in game order', () => {
    const observations = [
      failure(20, 'BV-04', { severity: 'minor' }),
      failure(22, 'BV-04', { severity: 'major' }),
      failure(24, 'BV-04', { severity: 'meaningful', reachability: 0.9 }),
      failure(26, 'BV-04', { severity: 'meaningful', reachability: 0.2 }),
      failure(28, 'BV-04', { severity: 'decisive' })
    ];
    const plies = addFocusFailureMoments([], observations, focus, mine, 3).map((moment) => moment.ply);
    expect(plies).toEqual([22, 24, 28]);
  });
});
