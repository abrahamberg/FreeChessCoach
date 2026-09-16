import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildPlyDiagnosticContext } from '../context.js';
import { TA_DEFENSIVE_DETECTORS } from './ta-defensive.js';
import { TA_OFFENSIVE_DETECTORS } from './ta-offensive.js';

/**
 * Task 53.5's explicit checklist item: a single ply can present both an
 * offensive opportunity (the mover missed using a motif) and a defensive
 * one (the mover missed answering a different motif the opponent had
 * reachable) at once, for two different codes — neither direction's
 * detector set should suppress the other.
 */
describe('TA offensive/defensive detectors on the same ply', () => {
  test('an O observation and a D observation for different codes both fire, independently', () => {
    const move: ClassifiedMoveDto = {
      ply: 1,
      moveSan: 'Kb1',
      mover: 'white',
      isUserMove: true,
      cpLoss: 400,
      quality: 'blunder',
      bestLineSan: ['Nd6+'],
      evalAfterCp: -400,
      hangsPiece: false,
      drop: 45,
      fenBefore: '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1',
      fenAfter: '4k3/1r6/8/8/2N5/8/1K6/8 b - - 1 1',
      bestMoveSan: 'Nd6+',
      tacticOpportunity: { type: 'fork', found: false, detail: 'Nd6+ forks king and rook' }
    };
    const ctx = buildPlyDiagnosticContext(move, {
      tacticDiagnostic: { type: 'skewer', failed: true, detail: 'missed the skewer on the rook' }
    })!;

    const offensiveObservation = TA_OFFENSIVE_DETECTORS.find((d) => d.code === 'TA-07')!.detect(ctx);
    const defensiveObservation = TA_DEFENSIVE_DETECTORS.find((d) => d.code === 'TA-14')!.detect(ctx);

    expect(offensiveObservation).not.toBeNull();
    expect(offensiveObservation!.direction).toBe('O');
    expect(defensiveObservation).not.toBeNull();
    expect(defensiveObservation!.direction).toBe('D');
  });
});
