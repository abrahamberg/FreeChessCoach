import { discoveredAttackDetector } from './discovered-attack.js';
import { forkDetector } from './fork.js';
import { freePieceDetector } from './free-piece.js';
import { pinDetector } from './pin.js';
import { removesDefenderDetector } from './removes-defender.js';
import { trappedPieceDetector } from './trapped-piece.js';
import type { TacticDetector } from './types.js';

/**
 * Priority-ordered: `classify-tactic-motif.ts` returns the first match, so
 * order here IS the tie-break precedence. Add a new tactic by adding one
 * entry here (see `README.md`) — never by editing the orchestrator.
 */
export const TACTIC_DETECTORS: TacticDetector[] = [
  forkDetector,
  pinDetector,
  discoveredAttackDetector,
  removesDefenderDetector,
  trappedPieceDetector,
  freePieceDetector
].sort((a, b) => a.priority - b.priority);
