import { DIAGNOSIS_CODES_BY_ID, SEVERITIES } from '@freechesscoach/shared';
import type { DiagnosticProfileEntry, FiredGate } from '@freechesscoach/chess-analysis';

/** §VI's "Required output to John" digested down to what a coach agent
 * needs mid-conversation: one profile entry plus any data-quality gates the
 * caller evaluated for that same code (Task 57.2's coach tool sources these
 * itself — `evaluate-gates.ts` is never run at persistence time, see
 * `rebuild-diagnostic-profile.ts`'s own doc comment). */
export interface DiagnosticReportItem {
  entry: DiagnosticProfileEntry;
  firedGates: readonly FiredGate[];
}

const NO_DIAGNOSES_FALLBACK =
  '(no confident diagnoses yet for this time control — either too little evidence, or every candidate is currently gated by a data-quality issue)';

/**
 * AGENTS.md rule 8: the coach never sees raw `DiagnosticProfileEntry` rows —
 * this is the one digested text block `get_diagnostic_profile` returns.
 * Caller has already picked which entries count as "top three" (Task 57.2:
 * confidence-then-recurrence ranked, capped at three) — this module only
 * renders, it doesn't select.
 */
export function renderDiagnosticProfileBlock(items: readonly DiagnosticReportItem[]): string {
  if (items.length === 0) return NO_DIAGNOSES_FALLBACK;
  return items.map((item, index) => renderDiagnosisItem(item, index + 1)).join('\n\n');
}

function renderDiagnosisItem(item: DiagnosticReportItem, rank: number): string {
  const { entry } = item;
  const label = DIAGNOSIS_CODES_BY_ID.get(entry.code)?.label ?? entry.code;
  const lines = [
    `${rank}. ${entry.code}.${entry.direction} — ${label}`,
    eoLine(entry),
    scopeLine(entry),
    controlLine(entry),
    failedGatesLine(item.firedGates)
  ].filter((line): line is string => line !== null);
  return lines.join('\n');
}

function eoLine(entry: DiagnosticProfileEntry): string {
  const severity =
    SEVERITIES.map((severity) => [severity, entry.severityMix[severity]] as const)
      .filter(([, count]) => count > 0)
      .map(([severity, count]) => `${count} ${severity}`)
      .join(', ') || 'none recorded';
  const failurePct = Math.round(entry.failureRate * 100);
  return `E/O: ${entry.episodes}/${entry.opportunities} (${failurePct}%) | Confidence: ${entry.confidence} | Severity: ${severity}`;
}

function scopeLine(entry: DiagnosticProfileEntry): string {
  return `Scope: ${entry.scopeTags.join(', ')}`;
}

function controlLine(entry: DiagnosticProfileEntry): string {
  if (!entry.controlSkill) return 'Control: no intact control skill on record';
  const controlPct = Math.round(entry.controlSkill.failureRate * 100);
  return `Control: ${entry.controlSkill.code}.${entry.controlSkill.direction} intact (${controlPct}% failure rate)`;
}

function failedGatesLine(firedGates: readonly FiredGate[]): string | null {
  if (firedGates.length === 0) return null;
  return `Failed gates: ${firedGates.map((gate) => `${gate.code} (${gate.evidence})`).join('; ')}`;
}
