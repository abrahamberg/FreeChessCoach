import type { ChecksCapturesThreats } from '@freechesscoach/shared';
import { analyzeChecksCapturesThreats } from '../checks-captures-threats.js';
import { flipActiveColorFen } from '../null-move-fen.js';
import type { PlyDiagnosticContext } from './context.js';

export interface NullMoveScan {
  /** `fenBefore` with the opponent to move. */
  fen: string;
  checksCapturesThreats: ChecksCapturesThreats;
}

const scans = new WeakMap<Pick<PlyDiagnosticContext, 'fenBefore'>, NullMoveScan | null>();

/**
 * The opponent's CCT scan of `fenBefore` as if the mover passed: what the
 * mover had to see. `null` when the mover was in check (no null move exists).
 * BV-01, MS-01 and MS-02 all ask for it, so it is computed at most once per
 * context and memoised on the context object (Task 77.3).
 */
export function nullMoveScanOf(ctx: Pick<PlyDiagnosticContext, 'fenBefore'>): NullMoveScan | null {
  const cached = scans.get(ctx);
  if (cached !== undefined) return cached;
  const fen = flipActiveColorFen(ctx.fenBefore);
  const scan = fen ? { fen, checksCapturesThreats: analyzeChecksCapturesThreats(fen) } : null;
  scans.set(ctx, scan);
  return scan;
}
