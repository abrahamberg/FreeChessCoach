import type { DiagnosisCodeId } from '@freechesscoach/shared';
import type { PlyDiagnosticContext } from '../context.js';
import { motifToCode } from '../motif-to-code.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';

/**
 * §II.E `TA-*`, defensive direction: "detecting, preventing, or answering
 * the idea" — sourced from `ctx.tacticDiagnostic` (Task 50.4's unbiased
 * `diagnosticByPly`, resolved to this ply by the caller), not
 * `ctx.tacticPrevention` (see that field's doc comment for the
 * BEST_OR_BETTER bias this avoids).
 *
 * `fork`/`pin` are excluded here: sub-typing them into `TA-07..10`/
 * `TA-11..12` needs a replay of the motif's embodying move
 * (`motif-to-code.ts`'s `MotifReplay`), and `diagnosticByPly`'s
 * `{type, failed, detail}` shape carries no such move — under-counting
 * (no detector for those 6 codes' defensive direction in this vertical
 * slice) is preferred over guessing which sub-code applies.
 */
const DEFENSIVE_CODES: readonly DiagnosisCodeId[] = [
  'TA-01',
  'TA-04',
  'TA-14',
  'TA-16',
  'TA-17',
  'TA-18',
  'TA-19',
  'TA-26',
  'TA-43'
];

function buildDefensiveDetector(code: DiagnosisCodeId, priority: number): DiagnosticDetector {
  return {
    code,
    direction: 'D',
    priority,
    detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null {
      const diagnostic = ctx.tacticDiagnostic;
      if (!diagnostic) return null;
      if (motifToCode(diagnostic.type) !== code) return null;

      return {
        code,
        direction: 'D',
        ply: ctx.ply,
        failed: diagnostic.failed,
        hwdl: diagnostic.failed ? (ctx.drop ?? 0) / 100 : 0,
        severity: diagnostic.failed ? 'meaningful' : 'minor',
        reachability: 1,
        detail: diagnostic.detail ?? `${diagnostic.type} defensive opportunity`
      };
    }
  };
}

/** Priority block 410-490 — after the offensive block (210-350), same
 * causal layer (recognition), direction is not itself a precedence axis. */
export const TA_DEFENSIVE_DETECTORS: readonly DiagnosticDetector[] = DEFENSIVE_CODES.map((code, index) =>
  buildDefensiveDetector(code, 410 + index * 10)
);
