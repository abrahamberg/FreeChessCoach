import type { GameRow } from '../../db/repositories/games.js';
import type { SessionRow } from '../../db/repositories/sessions.js';
import { finalizeBotGame, type FinalizeBotGameDependencies } from './bot-finalize.js';

export interface ResignBotGameResult {
  result: '1-0' | '0-1';
}

/**
 * The "flag" button: the student gives up immediately, regardless of whose
 * turn it is or how the position actually stands. Finalizes the game as a
 * loss for the student's color through the same finish line commitBotTurn's
 * own game-over detection uses (bot-finalize.ts), at the game's current ply
 * — a resignation doesn't add or remove any moves.
 */
export async function resignBotGame(
  deps: FinalizeBotGameDependencies,
  session: SessionRow,
  game: GameRow
): Promise<ResignBotGameResult> {
  const result: '1-0' | '0-1' = game.userColor === 'white' ? '0-1' : '1-0';
  await finalizeBotGame(deps, session, session.currentPly, result);
  return { result };
}
