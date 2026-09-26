import { createContext, useContext } from 'react';

/** Facts about the game being reviewed (session/kickoff-facts.ts), provided
 * by SessionPage — or about the current puzzle
 * (puzzle-session/puzzle-kickoff-facts.ts), provided by PuzzleSessionPage —
 * so ThinkingIndicator can turn the long kickoff wait into a walk through
 * them instead of a bare label, without threading a prop through ChatPane,
 * MobileCoachSessionBody and PagedMessageCard. Empty elsewhere, where the
 * plain indicator is shown. */
export const KickoffFactsContext = createContext<string[]>([]);

export function useKickoffFacts(): string[] {
  return useContext(KickoffFactsContext);
}
