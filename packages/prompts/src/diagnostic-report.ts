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

/** How much evidence stands behind the profile — lets the coach say "early
 * read" instead of presenting a 15-game lead as a settled pattern. */
export interface DiagnosticSampleContext {
  ratedGames: number;
  timeControl: string | null;
  /** Games needed before any profile exists. */
  requiredGames: number;
  /** Games above which the profile stops being an early read. */
  fullEvidenceGames: number;
}

const CONFIDENCE_KEY =
  'Confidence: "signal" = it has repeated in more than one game — a lead to check with the student, not yet their pattern; "probable" = repeated across several games and sittings — safe to name as their pattern.';

const NO_DIAGNOSES_FALLBACK =
  '(no confident diagnoses yet for this time control — either too little evidence, or every candidate is currently gated by a data-quality issue)';

/**
 * AGENTS.md rule 8: the coach never sees raw `DiagnosticProfileEntry` rows —
 * this is the one digested text block `get_diagnostic_profile` returns.
 * Caller has already picked which entries count as "top three" (Task 57.2:
 * confidence-then-recurrence ranked, capped at three) — this module only
 * renders, it doesn't select.
 */
export function renderDiagnosticProfileBlock(
  items: readonly DiagnosticReportItem[],
  sample?: DiagnosticSampleContext
): string {
  if (items.length === 0) return renderNoDiagnoses(sample);
  const body = items.map((item, index) => renderDiagnosisItem(item, index + 1)).join('\n\n');
  return [sampleLine(sample), CONFIDENCE_KEY, body].filter(Boolean).join('\n\n');
}

function renderNoDiagnoses(sample: DiagnosticSampleContext | undefined): string {
  if (!sample || sample.ratedGames >= sample.requiredGames) return NO_DIAGNOSES_FALLBACK;
  return `No cross-game profile yet: only ${sample.ratedGames} of ${sample.requiredGames} rated games ${timeControlPhrase(sample)}. Work from this game and the student's own words; anything you notice is a hypothesis to test with them (record_finding), not a pattern to announce.`;
}

function sampleLine(sample: DiagnosticSampleContext | undefined): string | null {
  if (!sample) return null;
  const base = `Evidence base: ${sample.ratedGames} rated games ${timeControlPhrase(sample)}.`;
  if (sample.ratedGames >= sample.fullEvidenceGames) return base;
  return `${base} This is an early read — hold every item loosely and say so if you lean on one.`;
}

function timeControlPhrase(sample: DiagnosticSampleContext): string {
  return sample.timeControl ? `at time control ${sample.timeControl}` : 'in one time control';
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
