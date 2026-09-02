import type { DiagnosisCodeId, Direction, Severity } from '@freechesscoach/shared';
import type { PlyDiagnosticContext } from './context.js';

/**
 * One diagnosis code's detection logic, in its own file under `detectors/`
 * (Tasks 53.3+) — mirrors `tactic-detectors/types.ts`. Unlike
 * `TacticDetector`, `detect` returns the full observation (not just a
 * boolean): a diagnostic detector also has to say *how badly* the
 * opportunity was missed, not only that one existed.
 */
export interface DiagnosticDetector {
  code: DiagnosisCodeId;
  direction: Direction;
  /** §I.3 causal precedence order. Ascending = resolved first when Task
   * 54.3's precedence pass picks one cause among several observations on the
   * same ply. Left with gaps of 10 so a later code can be inserted between
   * two existing ones without renumbering everything. */
  priority: number;
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null;
}

/**
 * §4.4: an opportunity's existence and its outcome are the same fact, not
 * two — a detector that finds no opportunity on this ply returns `null`,
 * never a `failed: false` row for "nothing happened here". `failed` only
 * distinguishes, among opportunities that *did* exist, whether the student
 * missed it (counts toward `E`) or handled it (counts toward `O` alone) —
 * see §4.3's O/E/E-over-O metrics, computed in Phase 55 from the stream of
 * observations this interface produces.
 */
export interface DiagnosticObservation {
  code: DiagnosisCodeId;
  direction: Direction;
  ply: number;
  failed: boolean;
  /** §4.3 human-reachable preventable expected-score loss for this one
   * incident. Phase 54 computes this properly (win-probability delta gated
   * by reachability); Phase 53 detectors may emit a provisional value. */
  hwdl: number;
  severity: Severity;
  /** §4.5 human reachability signal for the missed/handled move, 0–1.
   * Phase 54.1 replaces ad-hoc Phase 53 estimates with the calibrated one. */
  reachability: number;
  /** Human-readable, e.g. "missed Nd6+ forking king and rook". */
  detail: string;
}
