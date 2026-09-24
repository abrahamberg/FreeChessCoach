/**
 * Which of Game Review's tactic sentences leads the card.
 *
 * Since `docs/plan.md` Task 77.5 a move carries **at most one** tactic card —
 * its verdict's (`move-verdict/`), chosen as the reason that explains the
 * most of the eval — so there is nothing left to order on a new report. The
 * order below only matters for a report stored before that, which can carry
 * several: what the move handed over first, then the chance, then the
 * defused threat, the order the old rules settled on for the common case.
 */
export type TacticCardKind = 'allowed' | 'prevention' | 'opportunity';

const CARD_ORDER: readonly TacticCardKind[] = ['allowed', 'opportunity', 'prevention'];

/** Every kind, in the order they should be read. A move missing some of them
 * still gets all three names back — the caller renders what it has. */
export function orderTacticCards(): TacticCardKind[] {
  return [...CARD_ORDER];
}
