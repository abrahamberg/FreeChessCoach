import { z } from 'zod';

/**
 * Diagnostic axis vocabularies (`docs/diagnose.md` §I.1, §I.2, §III). These
 * are the fixed enums every diagnosis code / observation is built from —
 * see `docs/plan.md` Phase 52 for how the 410-code catalog (Task 52.2) and
 * `DiagnosisRef` (Task 52.4) consume them.
 */

/** §I.2 failure mechanisms — the causal-precedence order (rules → board
 * model → board update → scan/process → recognition → candidate generation
 * → calculation → judgment → state) is §I.3, not this array's order. */
export const MECHANISMS = ['K', 'M', 'V', 'R', 'G', 'C', 'J', 'X', 'L', 'S'] as const;
export const MechanismSchema = z.enum(MECHANISMS);
export type Mechanism = z.infer<typeof MechanismSchema>;

export const MECHANISM_LABELS: Record<Mechanism, string> = {
  K: 'Knowledge gap',
  M: 'Memory/retrieval gap',
  V: 'Visual/board-model gap',
  R: 'Recognition gap',
  G: 'Candidate-generation gap',
  C: 'Calculation gap',
  J: 'Judgment gap',
  X: 'Execution/process gap',
  L: 'Fluency/latency gap',
  S: 'State-conditioned gap'
};

/** §I.1 direction codes. */
export const DIRECTIONS = ['O', 'D', 'B', 'N'] as const;
export const DirectionSchema = z.enum(DIRECTIONS);
export type Direction = z.infer<typeof DirectionSchema>;

export const DIRECTION_LABELS: Record<Direction, string> = {
  O: 'Offensive: using or creating the idea',
  D: 'Defensive: detecting, preventing, or answering the idea',
  B: 'Both directions are impaired',
  N: 'Direction is not applicable'
};

/** §III.1 historical status. */
export const HISTORY_STATUSES = [
  'newly_observed',
  'persistent',
  'improving',
  'monitoring',
  'resolved',
  'regressed',
  'nonresponsive',
  'superseded'
] as const;
export const HistoryStatusSchema = z.enum(HISTORY_STATUSES);
export type HistoryStatus = z.infer<typeof HistoryStatusSchema>;

export const HISTORY_STATUS_LABELS: Record<HistoryStatus, string> = {
  newly_observed: 'Newly observed',
  persistent: 'Persistent',
  improving: 'Improving',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  regressed: 'Regressed',
  nonresponsive: 'Nonresponsive',
  superseded: 'Superseded'
};

/** §III.2 scope tags. "Context-bound" is not a historical status — this is
 * a separate axis from `HISTORY_STATUSES` by design. */
export const SCOPE_TAGS = [
  'general',
  'opening_bound',
  'structure_bound',
  'side_color_bound',
  'game_phase_bound',
  'time_control_bound',
  'clock_bound',
  'complexity_bound',
  'opponent_strength_bound',
  'session_bound',
  'device_interface_bound',
  'stress_sensitive'
] as const;
export const ScopeTagSchema = z.enum(SCOPE_TAGS);
export type ScopeTag = z.infer<typeof ScopeTagSchema>;

export const SCOPE_TAG_LABELS: Record<ScopeTag, string> = {
  general: 'General',
  opening_bound: 'Opening-bound',
  structure_bound: 'Structure-bound',
  side_color_bound: 'Side/color-bound',
  game_phase_bound: 'Game-phase-bound',
  time_control_bound: 'Time-control-bound',
  clock_bound: 'Clock-bound',
  complexity_bound: 'Complexity-bound',
  opponent_strength_bound: 'Opponent-strength-bound',
  session_bound: 'Session-bound',
  device_interface_bound: 'Device/interface-bound',
  stress_sensitive: 'Stress-sensitive'
};

/** §III.3 severity bands, ascending. */
export const SEVERITIES = ['minor', 'meaningful', 'major', 'decisive'] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_LABELS: Record<Severity, string> = {
  minor: 'Minor',
  meaningful: 'Meaningful',
  major: 'Major',
  decisive: 'Decisive'
};

/** §4.1 evidence tracks. */
export const EVIDENCE_TRACKS = [
  'game_leak',
  'knowledge_inventory',
  'process_finding',
  'state_finding',
  'curriculum_only_gap'
] as const;
export const EvidenceTrackSchema = z.enum(EVIDENCE_TRACKS);
export type EvidenceTrack = z.infer<typeof EvidenceTrackSchema>;

export const EVIDENCE_TRACK_LABELS: Record<EvidenceTrack, string> = {
  game_leak: 'Game leak',
  knowledge_inventory: 'Knowledge inventory',
  process_finding: 'Process finding',
  state_finding: 'State finding',
  curriculum_only_gap: 'Curriculum-only gap'
};

/** §4.6 confidence tiers, ascending. `'confirmed'` is listed for
 * completeness only — see `EMITTABLE_CONFIDENCE_LEVELS` below. */
export const CONFIDENCE_LEVELS = ['insufficient', 'signal', 'probable', 'confirmed'] as const;
export const ConfidenceLevelSchema = z.enum(CONFIDENCE_LEVELS);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const CONFIDENCE_LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  insufficient: 'Insufficient',
  signal: 'Signal',
  probable: 'Probable',
  confirmed: 'Confirmed'
};

/**
 * `'confirmed'` requires a blinded mechanism-matched probe (§4.6), and this
 * build has no probe subsystem (`docs/plan.md` Phase 52 scope decision #2)
 * — so nothing in this codebase may ever emit it. Every confidence value a
 * detector or profile builder produces must be validated against this
 * narrower set, not `CONFIDENCE_LEVELS`.
 */
export const EMITTABLE_CONFIDENCE_LEVELS = CONFIDENCE_LEVELS.filter(
  (level): level is Exclude<ConfidenceLevel, 'confirmed'> => level !== 'confirmed'
);
export const EmittableConfidenceLevelSchema = z.enum(
  EMITTABLE_CONFIDENCE_LEVELS as [Exclude<ConfidenceLevel, 'confirmed'>, ...Exclude<ConfidenceLevel, 'confirmed'>[]]
);
export type EmittableConfidenceLevel = z.infer<typeof EmittableConfidenceLevelSchema>;
