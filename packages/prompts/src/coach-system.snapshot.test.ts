import { describe, test, expect } from 'vitest';
import { COACH_PERSONAS, RATING_BANDS } from '@freechesscoach/shared';
import { buildCoachSystemPrompt } from './coach-system.js';
import { baseCoachInput } from './fixtures.js';

/**
 * Full-text snapshot coverage for the actual assembled prompt, on top of the
 * structural assertions in coach-system.test.ts. This is the safety net for
 * a large rewrite: any edit to coach-system.ts, coach-persona.ts, render.ts,
 * tools.ts, or tools-play.ts shows up here as a snapshot diff naming exactly
 * what changed — which lets a reviewer confirm a change touched only what it
 * meant to. Update snapshots deliberately (`vitest run -u`) after an
 * intentional prompt edit, review the diff like any other code change, and
 * commit the new .snap file alongside it.
 */
describe('buildCoachSystemPrompt snapshots', () => {
  for (const mode of ['analyze', 'play'] as const) {
    for (const persona of COACH_PERSONAS) {
      test(`mode=${mode} persona=${persona}`, () => {
        const { staticPart, dynamicPart } = buildCoachSystemPrompt(
          baseCoachInput({ mode, persona, ...(mode === 'play' ? { plan: null } : {}) })
        );
        expect(staticPart).toMatchSnapshot('staticPart');
        expect(dynamicPart).toMatchSnapshot('dynamicPart');
      });
    }
  }

  for (const band of RATING_BANDS) {
    test(`band=${band}`, () => {
      const { staticPart } = buildCoachSystemPrompt(baseCoachInput({ band }));
      expect(staticPart).toMatchSnapshot('staticPart');
    });
  }
});
