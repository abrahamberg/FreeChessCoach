import type { Severity } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';

/**
 * The already-computed win% series for one move — the same shape
 * `ClassifiedMoveDto`/`MoveClassificationInput` already carry, mirroring
 * `classify-severity.ts`'s own `classifySeverity` input so this stays a
 * free-standing, `PlyDiagnosticContext`-independent primitive (same reason
 * `reachability.ts`'s `computeHumanReachability` isn't ctx-shaped either —
 * wiring either one into the context is whichever future task first
 * actually needs it).
 */
export interface HwdlInput {
  /** Mover-perspective win% before the move, 0-100 —
   * `ClassifiedMoveDto.winPctBefore`. */
  winPctBefore: number;
  /** Mover-perspective win% after the move, 0-100 —
   * `ClassifiedMoveDto.winPctAfter`. */
  winPctAfter: number;
  /** White-perspective centipawn score before/after — only used for the
   * dead-drawn-technical-position damping check below, which (like
   * `classify-severity.ts`'s `isDeadDrawTechnicalPosition`) needs the
   * unadjusted score to tell "genuinely near-drawn" from "just happens to
   * read close to 50% for this side of a position that's actually sharp". */
  cpBefore: number;
  cpAfter: number;
}

/**
 * §4.3's hWDL: preventable expected-score loss, mover-perspective, in
 * `[0, 1]`. `winPctBefore`/`winPctAfter` are themselves already win
 * probabilities from the identical sigmoid `classify.ts`'s `expectedPoints`
 * wraps (see `win-probability.ts`'s `winPctFor`) — dividing their
 * (non-negative) difference by 100 reuses that existing computation rather
 * than re-deriving a fresh probability from a centipawn score.
 */
export function computeHwdl(input: Pick<HwdlInput, 'winPctBefore' | 'winPctAfter'>): number {
  return Math.max(0, (input.winPctBefore - input.winPctAfter) / 100);
}

const { minorMaxHwdl: MINOR_MAX_HWDL, meaningfulMaxHwdl: MEANINGFUL_MAX_HWDL, majorMaxHwdl: MAJOR_MAX_HWDL } = CONFIG.hwdl;
const {
  dampingHighWin: DAMPING_HIGH_WIN,
  dampingLowWin: DAMPING_LOW_WIN,
  deadDrawWinLow: DEAD_DRAW_WIN_LOW,
  deadDrawWinHigh: DEAD_DRAW_WIN_HIGH,
  deadDrawCpAbs: DEAD_DRAW_CP_ABS
} = CONFIG.severity;

/**
 * §III.3's four-band severity from an hWDL fraction, with the same
 * already-decided-position damping principle `classify-severity.ts`'s
 * `classifySeverity` applies (both sides already winning/losing, or a
 * technically-drawn quiet position) — there, a big win% swing inside a
 * position whose practical outcome never changes is capped down; here it's
 * capped all the way to `minor`, since a swing that can't move the result
 * isn't a meaningful/major/decisive loss no matter its raw size.
 */
export function hwdlSeverity(hwdl: number, input: Pick<HwdlInput, 'winPctBefore' | 'winPctAfter' | 'cpBefore' | 'cpAfter'>): Severity {
  if (isAlreadyDecidedPosition(input)) return 'minor';
  return baseHwdlSeverity(hwdl);
}

function baseHwdlSeverity(hwdl: number): Severity {
  if (hwdl < MINOR_MAX_HWDL) return 'minor';
  if (hwdl < MEANINGFUL_MAX_HWDL) return 'meaningful';
  if (hwdl < MAJOR_MAX_HWDL) return 'major';
  return 'decisive';
}

function isAlreadyDecidedPosition(input: Pick<HwdlInput, 'winPctBefore' | 'winPctAfter' | 'cpBefore' | 'cpAfter'>): boolean {
  if (input.winPctBefore >= DAMPING_HIGH_WIN && input.winPctAfter >= DAMPING_HIGH_WIN) return true;
  if (input.winPctBefore <= DAMPING_LOW_WIN && input.winPctAfter <= DAMPING_LOW_WIN) return true;

  return (
    input.winPctBefore >= DEAD_DRAW_WIN_LOW &&
    input.winPctBefore <= DEAD_DRAW_WIN_HIGH &&
    input.winPctAfter >= DEAD_DRAW_WIN_LOW &&
    input.winPctAfter <= DEAD_DRAW_WIN_HIGH &&
    Math.abs(input.cpBefore) < DEAD_DRAW_CP_ABS &&
    Math.abs(input.cpAfter) < DEAD_DRAW_CP_ABS
  );
}
