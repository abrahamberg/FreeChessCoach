import { discoveredAttackDetector } from './discovered-attack.js';
import { doubleCheckDetector } from './double-check.js';
import { forkDetector } from './fork.js';
import { freePieceDetector } from './free-piece.js';
import { overloadedDefenderDetector } from './overloaded-defender.js';
import { pinDetector } from './pin.js';
import { removesDefenderDetector } from './removes-defender.js';
import { skewerDetector } from './skewer.js';
import { trappedPieceDetector } from './trapped-piece.js';
import { weakBackRankDetector } from './weak-back-rank.js';
import type { TacticDetector } from './types.js';

/**
 * Priority-ordered: `classify-tactic-motif.ts` returns the first match, so
 * order here IS the tie-break precedence. Add a new tactic by adding one
 * entry here (see `README.md`) — never by editing the orchestrator.
 */
export const TACTIC_DETECTORS: TacticDetector[] = [
  doubleCheckDetector,
  forkDetector,
  skewerDetector,
  pinDetector,
  discoveredAttackDetector,
  overloadedDefenderDetector,
  removesDefenderDetector,
  weakBackRankDetector,
  trappedPieceDetector,
  freePieceDetector
].sort((a, b) => a.priority - b.priority);
