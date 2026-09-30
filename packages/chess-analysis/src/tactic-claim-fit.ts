import type { MovePhase, TacticMotifType } from '@freechesscoach/shared';

export interface CardFitContext {
  moveSan: string;
  mover: 'white' | 'black';
  /** The game phase at the move; absent for a caller that has none. */
  phase?: MovePhase | null;
  isCheckmate: boolean;
  /** The engine's line after the move is a forced mate for either side. */
  mateAhead: boolean;
}

/** Defensive motifs read wrong on a check or a mate: Réti's queen sacrifice
 * 9.Qd8+ "saves the bishop on d2", 11.Bd8# "moves the bishop off g5, out of
 * reach". */
const DEFENSIVE_MOTIFS = new Set<TacticMotifType>(['defendsHangingPiece', 'removesTarget', 'escapesFork', 'blocksThreat', 'breaksPin']);

/** Whether the card for this move is a fair sentence about it. Claims that
 * are true of the board but wrong as the point of the move lose the card,
 * once, for the review and the course alike. */
export function cardFits(card: { type: TacticMotifType; gain?: { kind: string } }, context: CardFitContext): boolean {
  // A mate says why in its board facts; the card only helps when it is about
  // the mate: 17.Rd8# read "You won a knight through a checkmate", and with a
  // mate ahead the Fishing Pole's …Qh4 read "You took the open file".
  if (context.isCheckmate || context.mateAhead) return card.gain?.kind === 'mate';
  if (card.type === 'spaceGain') return !isPromotionRace(context);
  return !(DEFENSIVE_MOTIFS.has(card.type) && context.moveSan.endsWith('+'));
}

/** A pawn run in an endgame, or to the sixth rank and past it, is a race to
 * promote, not space: the square rule's 5.f8=Q read "pushes a pawn to f8,
 * taking space". */
function isPromotionRace({ moveSan, mover, phase }: CardFitContext): boolean {
  if (phase === 'endgame') return true;
  const rank = Number(/([1-8])(?:=[QRBN])?[+#]?$/.exec(moveSan)?.[1] ?? 0);
  return mover === 'white' ? rank >= 6 : rank >= 1 && rank <= 3;
}
