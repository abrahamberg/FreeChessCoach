import { createContext, useContext } from 'react';

/** Facts about the game being reviewed (session/kickoff-facts.ts), provided
 * by SessionPage so ThinkingIndicator can turn the long kickoff wait into a
 * walk through this game instead of a bare label — without threading a prop
 * through ChatPane, MobileCoachSessionBody and PagedMessageCard. Empty
 * outside a session page, where the plain indicator is shown. */
export const KickoffFactsContext = createContext<string[]>([]);

export function useKickoffFacts(): string[] {
  return useContext(KickoffFactsContext);
}
