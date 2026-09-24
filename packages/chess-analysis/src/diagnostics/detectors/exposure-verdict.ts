import { Chess } from 'chess.js';
import { CONFIG } from '../../config.js';
import { see } from '../../see.js';
import type { DiscoveredAttackHit } from '../../tactic-discovered.js';
import type { PlyDiagnosticContext } from '../context.js';
import { lossConfirmed } from '../eval-verdict.js';
import { refutationCostsMaterial, refutationWinsOn, walkedRefutation } from '../threat-inventory.js';
import { opponentOf } from './shared.js';

const { minThreatSeeCp: MIN_THREAT_SEE_CP } = CONFIG.evalWitness;

/**
 * BV-12/BV-16's failure verdict: the move opened a line for the opponent's
 * piece on `hit.piece` onto the mover's piece on `hit.revealed`, and that
 * exposure is what cost the eval. With the engine's refutation known, the
 * line must start with the revealing piece or capture on the revealed
 * square; without it (the live path), the revealed piece must be the king
 * or be statically winnable (SEE ≥ `minThreatSeeCp`).
 */
export function exposureRealised(ctx: PlyDiagnosticContext, hit: DiscoveredAttackHit): boolean {
  if (!lossConfirmed(ctx)) return false;

  const walked = walkedRefutation(ctx);
  if (walked) {
    const startsFromRevealer = walked[0]?.uci.slice(0, 2) === hit.piece && refutationCostsMaterial(ctx, walked);
    return startsFromRevealer || refutationWinsOn(ctx, walked, hit.revealed);
  }
  if (new Chess(ctx.fenAfter).get(hit.revealed)?.type === 'k') return true;
  return see(ctx.fenAfter, hit.revealed, opponentOf(ctx.mover)) >= MIN_THREAT_SEE_CP;
}
