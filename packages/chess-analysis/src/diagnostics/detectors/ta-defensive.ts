import type { DiagnosisCodeId } from '@freechesscoach/shared';
import type { PlyDiagnosticContext } from '../context.js';
import { buildEvalObservation, lossConfirmed } from '../eval-verdict.js';
import { motifToCode } from '../motif-to-code.js';
import type { DiagnosticDetector, DiagnosticObservation } from '../types.js';

/**
 * §II.E `TA-*`, defensive direction: "detecting, preventing, or answering
 * the idea" — sourced from `ctx.tacticDiagnostic`, the opponent tactic the
 * move's verdict says it allowed or defused (Task 77.5), not
 * `ctx.tacticPrevention`.
 *
 * `fork`/`pin` are excluded here: sub-typing them into `TA-07..10`/
 * `TA-11..12` needs a replay of the motif's embodying move
 * (`motif-to-code.ts`'s `MotifReplay`), which `{type, failed, detail}`
 * doesn't carry. The analysis job still records those codes: the verdict's
 * own card has the move, and `build-diagnostics.ts` synthesises the
 * observation when no detector returns one (`verdictDiagnosticCode`).
 *
 * `failed` needs both the diagnostic's own verdict and an eval-confirmed
 * loss (`lossConfirmed`); `hwdl`/`severity` follow `buildEvalObservation`.
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

      // A motif left reachable is a failure only when the eval confirms the
      // move lost value — a sound sacrifice leaves the shape but not a loss.
      const failed = diagnostic.failed && lossConfirmed(ctx);
      const detail = diagnostic.detail ?? `${diagnostic.type} defensive opportunity`;
      return buildEvalObservation(ctx, code, 'D', failed, detail);
    }
  };
}

/** Priority block 410-490 — after the offensive block (210-350), same
 * causal layer (recognition), direction is not itself a precedence axis. */
export const TA_DEFENSIVE_DETECTORS: readonly DiagnosticDetector[] = DEFENSIVE_CODES.map((code, index) =>
  buildDefensiveDetector(code, 410 + index * 10)
);
