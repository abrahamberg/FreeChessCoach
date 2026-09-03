import { describe, expect, test } from 'vitest';
import { BOT_ROSTER, DIAGNOSIS_CODES_BY_ID } from '@freechesscoach/shared';
import { MOTIF_RESOLVABLE_DIAGNOSIS_CODES } from './diagnostics/motif-to-code.js';

/**
 * Lives here (not in packages/shared, where BOT_ROSTER is defined) because
 * `packages/shared` has no dependency on `@freechesscoach/chess-analysis` —
 * MOTIF_RESOLVABLE_DIAGNOSIS_CODES only exists on this side. Enforces
 * docs/plan.md's Phase 61 scope decision in code, not only in bot-roster.ts's
 * doc comment: a bot may only be "documented" with a diagnosis code its own
 * move selection can actually be shown to exhibit.
 */
describe('BOT_ROSTER diagnosisCodes', () => {
  test('every entry\'s diagnosisCodes is a subset of MOTIF_RESOLVABLE_DIAGNOSIS_CODES', () => {
    const resolvable = new Set(MOTIF_RESOLVABLE_DIAGNOSIS_CODES);
    for (const bot of BOT_ROSTER) {
      for (const code of bot.diagnosisCodes) {
        expect(resolvable.has(code), `${bot.id} has ${code}, not in MOTIF_RESOLVABLE_DIAGNOSIS_CODES`).toBe(true);
      }
    }
  });

  test('every entry\'s diagnosisCodes are real catalog ids', () => {
    for (const bot of BOT_ROSTER) {
      for (const code of bot.diagnosisCodes) {
        expect(DIAGNOSIS_CODES_BY_ID.has(code), `${bot.id} has ${code}, not a known diagnosis code`).toBe(true);
      }
    }
  });
});
