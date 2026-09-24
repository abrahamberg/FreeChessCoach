import type { DiagnosisCodeId } from '@freechesscoach/shared';
import type { PlyDiagnosticContext } from '../context.js';
import { buildEvalObservation } from '../eval-verdict.js';
import { opponentThreatsAfter, opponentThreatsBefore, realizedThreats, type Threat, type ThreatKind } from '../threat-inventory.js';
import type { DiagnosticObservation } from '../types.js';

/**
 * The shared shape of MS-01/02/03 (§II.D's opponent check/capture/threat
 * scans), one `ThreatKind` each:
 * - an opportunity is the opponent holding a *dangerous* forcing move of
 *   that kind before this move, or one left standing after it that the
 *   engine's refutation actually carried out;
 * - a failure is only the latter: that specific threat was realised and
 *   the eval confirms the loss (`realizedThreats`).
 * A threat left standing that was not realised (compensated, or never
 * real) does not fail; it still counts as a success when the pre-move
 * threat existed.
 */
export function detectOpponentThreatScan(
  ctx: PlyDiagnosticContext,
  code: DiagnosisCodeId,
  kind: ThreatKind,
  before: readonly Threat[] = opponentThreatsBefore(ctx, kind)
): DiagnosticObservation | null {
  const realised = realizedThreats(ctx, opponentThreatsAfter(ctx, kind));
  if (before.length === 0 && realised.length === 0) return null;

  const failed = realised.length > 0;
  const detail = failed ? realisedDetail(kind, realised) : handledDetail(kind, before);
  return buildEvalObservation(ctx, code, 'D', failed, detail);
}

function realisedDetail(kind: ThreatKind, realised: readonly Threat[]): string {
  return `left the opponent's ${plural(kind, realised.length)} ${describe(realised)} standing, and the eval confirms it cost them`;
}

function handledDetail(kind: ThreatKind, before: readonly Threat[]): string {
  return `faced the opponent's ${plural(kind, before.length)} ${describe(before)} and did not lose to it`;
}

function describe(threats: readonly Threat[]): string {
  return threats.map((threat) => `${threat.moveSan} (on ${threat.target})`).join(', ');
}

function plural(noun: string, count: number): string {
  return count > 1 ? `${noun}s` : noun;
}
