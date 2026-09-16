import { describe, expect, test } from 'vitest';
import { BOT_ROSTER, DIAGNOSIS_CODES_BY_ID, ELIGIBLE_DIAGNOSIS_CODES } from '@freechesscoach/shared';
import { CANDIDATE_PROXY_RESOLVABLE_DIAGNOSIS_CODES } from './diagnostics/candidate-diagnosis-proxy.js';
import { MOTIF_RESOLVABLE_DIAGNOSIS_CODES } from './diagnostics/motif-to-code.js';

/**
 * Lives here (not in packages/shared, where BOT_ROSTER/ELIGIBLE_DIAGNOSIS_CODES
 * are defined) because `packages/shared` has no dependency on
 * `@freechesscoach/chess-analysis` —
 * MOTIF_RESOLVABLE_DIAGNOSIS_CODES/CANDIDATE_PROXY_RESOLVABLE_DIAGNOSIS_CODES
 * only exist on this side, which is exactly why bot-roster.ts's
 * ELIGIBLE_DIAGNOSIS_CODES is a hand-maintained literal rather than an
 * import — enforced in sync here. Enforces docs/plan.md's Phase 61/62 scope
 * decision in code, not only in bot-roster.ts's doc comment: a bot may only
 * be "documented" with a diagnosis code its own move selection can actually
 * be shown to exhibit.
 */
describe('BOT_ROSTER diagnosisCodes', () => {
  test('ELIGIBLE_DIAGNOSIS_CODES matches the union of MOTIF_RESOLVABLE and CANDIDATE_PROXY_RESOLVABLE codes', () => {
    const union = new Set([...MOTIF_RESOLVABLE_DIAGNOSIS_CODES, ...CANDIDATE_PROXY_RESOLVABLE_DIAGNOSIS_CODES]);
    expect(new Set(ELIGIBLE_DIAGNOSIS_CODES)).toEqual(union);
  });

  test('every entry\'s diagnosisCodes is a subset of ELIGIBLE_DIAGNOSIS_CODES', () => {
    const resolvable = new Set(ELIGIBLE_DIAGNOSIS_CODES);
    for (const bot of BOT_ROSTER) {
      for (const code of bot.diagnosisCodes) {
        expect(resolvable.has(code), `${bot.id} has ${code}, not in ELIGIBLE_DIAGNOSIS_CODES`).toBe(true);
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

  test('diagnosisCodes breadth is non-increasing as elo increases (docs/plan.md Phase 62)', () => {
    const sortedByElo = [...BOT_ROSTER].sort((a, b) => a.elo - b.elo);
    for (let i = 1; i < sortedByElo.length; i++) {
      const lower = sortedByElo[i - 1]!;
      const higher = sortedByElo[i]!;
      expect(
        higher.diagnosisCodes.length,
        `${higher.id} (elo ${higher.elo}, ${higher.diagnosisCodes.length} codes) documents more than ` +
          `${lower.id} (elo ${lower.elo}, ${lower.diagnosisCodes.length} codes)`
      ).toBeLessThanOrEqual(lower.diagnosisCodes.length);
    }
  });

  test('the lowest-elo bot documents the full eligible pool ("all diagnose")', () => {
    const lowest = [...BOT_ROSTER].sort((a, b) => a.elo - b.elo)[0]!;
    expect(new Set(lowest.diagnosisCodes)).toEqual(new Set(ELIGIBLE_DIAGNOSIS_CODES));
  });
});
