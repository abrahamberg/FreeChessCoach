import type { DiagnosisCodeId, Direction, Severity } from '@freechesscoach/shared';
import type { PlyDiagnosticContext } from './context.js';
import { buildObservation, qualityFailed, severityFromQuality } from './detectors/shared.js';
import { isCompletelyDecidedPosition } from './decided-position.js';
import type { DiagnosticObservation } from './types.js';

/** Win% gap bands for `buildEvalObservation`'s severity, most severe first. */
const SEVERITY_BY_WIN_PCT_GAP: ReadonlyArray<readonly [number, Severity]> = [
  [30, 'decisive'],
  [20, 'major'],
  [10, 'meaningful']
];

/**
 * Did the move actually cost the student something? The eval witness
 * (`ctx.playedGap`, best line against the played move) answers when the
 * stored move has both evals; a legacy move falls back to its own quality,
 * which is what every detector used before the witness existed.
 */
export function lossConfirmed(ctx: Pick<PlyDiagnosticContext, 'playedGap' | 'quality'>): boolean {
  if (ctx.playedGap) return ctx.playedGap.meaningful;
  return qualityFailed(ctx.quality);
}

/**
 * DQ-09 at detection time: a ply where the best line and the played move
 * are both completely won, or both completely lost, says nothing about a
 * skill, so no detector runs on it — neither its failures nor its
 * successes are counted. A ply missing either win% is kept.
 */
export function isDiagnosticallyMeaningfulPly(ctx: Pick<PlyDiagnosticContext, 'winPctBefore' | 'winPctAfter'>): boolean {
  if (ctx.winPctBefore === undefined || ctx.winPctAfter === undefined) return true;
  return !isCompletelyDecidedPosition(ctx.winPctBefore, ctx.winPctAfter);
}

/**
 * The eval-witnessed counterpart of `buildQualityObservation`: `hwdl` and
 * `severity` come from the best-vs-played win% gap instead of the move's
 * quality label. A legacy move without evals falls back to `ctx.drop` and
 * `severityFromQuality`, exactly as before.
 */
export function buildEvalObservation(
  ctx: PlyDiagnosticContext,
  code: DiagnosisCodeId,
  direction: Direction,
  failed: boolean,
  detail: string
): DiagnosticObservation {
  if (!ctx.playedGap) return buildObservation(ctx, code, direction, failed, severityFromQuality(ctx.quality), detail);

  const winPctGap = Math.max(0, ctx.playedGap.winPctGap);
  return {
    ...buildObservation(ctx, code, direction, failed, severityFromWinPctGap(winPctGap), detail),
    hwdl: failed ? winPctGap / 100 : 0,
    reachability: 1
  };
}

function severityFromWinPctGap(winPctGap: number): Severity {
  return SEVERITY_BY_WIN_PCT_GAP.find(([minGap]) => winPctGap >= minGap)?.[1] ?? 'minor';
}
