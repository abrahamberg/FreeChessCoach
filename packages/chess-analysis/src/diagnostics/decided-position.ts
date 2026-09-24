import { CONFIG } from '../config.js';

const { dampingHighWin: DAMPING_HIGH_WIN, dampingLowWin: DAMPING_LOW_WIN } = CONFIG.severity;

/**
 * `DQ-09`: "incidents occurred only in completely lost or trivially won
 * positions" — both readings pinned at the same extreme (reusing
 * `CONFIG.severity`'s own damping thresholds, not new magic numbers).
 * Deliberately narrower than `hwdl.ts`'s `isAlreadyDecidedPosition`, which
 * also damps a technically-drawn quiet position — DQ-09 is only about
 * "lost" or "won", not "drawn".
 */
export function isCompletelyDecidedPosition(winPctBefore: number, winPctAfter: number): boolean {
  return (
    (winPctBefore >= DAMPING_HIGH_WIN && winPctAfter >= DAMPING_HIGH_WIN) ||
    (winPctBefore <= DAMPING_LOW_WIN && winPctAfter <= DAMPING_LOW_WIN)
  );
}
