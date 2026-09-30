import type { BoardFact } from './types.js';

/** The tactic words a fact supports, for the verifier: a script may say
 * "fork" or "pin" only where a fact of that kind is in the dossier. */
export function factWords(fact: BoardFact): string[] {
  switch (fact.kind) {
    case 'forks':
      return ['fork'];
    case 'attacks':
      return [...(fact.pinnedTo ? ['pinned'] : []), ...(fact.trapped ? ['trapped'] : [])];
    case 'discoveredCheck':
      return ['discovered check'];
    case 'doubleCheck':
      return ['double check'];
    case 'gives':
      return fact.check === 'checkmate' ? ['checkmate'] : [];
    case 'mateNet':
      return ['checkmate'];
    case 'backRankMate':
      return ['back-rank mate'];
    case 'leavesHanging':
      return fact.stalemateIfTaken ? ['stalemate'] : [];
    default:
      return [];
  }
}
