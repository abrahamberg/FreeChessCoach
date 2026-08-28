import { Chess } from 'chess.js';

export interface GameOutcome {
  isOver: boolean;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  reason: 'checkmate' | 'stalemate' | 'insufficient_material' | 'threefold_repetition' | 'fifty_move_rule' | null;
}

const NOT_OVER: GameOutcome = { isOver: false, result: null, reason: null };

/**
 * Determines whether a live game (play/play_bot mode) has ended, and why —
 * no equivalent exists today because session completion has so far only
 * ever been driven by the coach's own end_session tool call, which a
 * chat-less bot game never triggers. Checked in this priority order because
 * a position can technically satisfy more than one (e.g. an insufficient-
 * material position is also never a threefold repetition yet, but checkmate
 * always wins over a simultaneous stalemate-shaped read).
 */
export function gameOutcomeFromPgn(pgn: string): GameOutcome {
  const chess = new Chess();
  chess.loadPgn(pgn);

  if (chess.isCheckmate()) {
    return { isOver: true, result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  }
  if (chess.isStalemate()) return { isOver: true, result: '1/2-1/2', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { isOver: true, result: '1/2-1/2', reason: 'insufficient_material' };
  if (chess.isThreefoldRepetition()) return { isOver: true, result: '1/2-1/2', reason: 'threefold_repetition' };
  if (chess.isDrawByFiftyMoves()) return { isOver: true, result: '1/2-1/2', reason: 'fifty_move_rule' };

  return NOT_OVER;
}
