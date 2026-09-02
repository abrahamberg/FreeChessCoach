import { Chess, type Square } from 'chess.js';
import type { DiagnosisCodeId, Direction, MoveQuality, Severity } from '@freechesscoach/shared';
import type { PlyDiagnosticContext } from '../context.js';
import type { DiagnosticObservation } from '../types.js';

/** §4.4's "materially affect the decision" gate, reused by every MS
 * detector whose failure criterion is "the resulting move quality was
 * actually bad" rather than a detector-specific criterion (MS-07/MS-14). */
const FAILING_QUALITIES: ReadonlySet<MoveQuality> = new Set(['mistake', 'blunder', 'miss']);
export function qualityFailed(quality: MoveQuality): boolean {
  return FAILING_QUALITIES.has(quality);
}

/** §III.3 severity band from move quality — 'blunder' is the ascending
 * ceiling ('decisive'); non-failing qualities floor at 'minor'. A rough
 * proxy pending a calibrated mapping. */
export function severityFromQuality(quality: MoveQuality): Severity {
  if (quality === 'blunder') return 'decisive';
  if (quality === 'miss') return 'major';
  if (quality === 'mistake') return 'meaningful';
  return 'minor';
}

/**
 * Assembles a `DiagnosticObservation` from a ply context plus the
 * detector's own `failed`/`severity` verdict. `hwdl` is `ctx.drop` (this
 * move's win% drop, 0–100) scaled to 0–1 when the observation is a failure,
 * 0 otherwise — a provisional stand-in for Phase 54's calibrated hWDL.
 * `reachability` is a flat placeholder (assumed reachable) until Phase
 * 54.1 replaces it with the real signal.
 */
export function buildObservation(
  ctx: PlyDiagnosticContext,
  code: DiagnosisCodeId,
  direction: Direction,
  failed: boolean,
  severity: Severity,
  detail: string
): DiagnosticObservation {
  return {
    code,
    direction,
    ply: ctx.ply,
    failed,
    hwdl: failed ? (ctx.drop ?? 0) / 100 : 0,
    severity,
    reachability: 1,
    detail
  };
}

/** The quality-driven shorthand every MS-01..06/08 detector uses: the
 * opportunity fires with `failed`/`severity` derived straight from this
 * move's own classified quality. */
export function buildQualityObservation(
  ctx: PlyDiagnosticContext,
  code: DiagnosisCodeId,
  direction: Direction,
  detail: string
): DiagnosticObservation {
  return buildObservation(ctx, code, direction, qualityFailed(ctx.quality), severityFromQuality(ctx.quality), detail);
}

export function isCaptureSan(moveSan: string): boolean {
  return moveSan.includes('x');
}

/** Replays one SAN move from a FEN to find its destination square — the
 * same one-off replay pattern `tactic-detectors/context.ts` uses, not an
 * engine call. Returns `null` for an illegal/malformed move rather than
 * throwing, since callers work from stored data that predates this check. */
export function destinationSquare(fenBefore: string, moveSan: string): Square | null {
  try {
    const chess = new Chess(fenBefore);
    const move = chess.move(moveSan);
    return move ? (move.to as Square) : null;
  } catch {
    return null;
  }
}

export function opponentOf(mover: 'white' | 'black'): 'white' | 'black' {
  return mover === 'white' ? 'black' : 'white';
}
