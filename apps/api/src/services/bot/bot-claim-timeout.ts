import type { GameRow } from '../../db/repositories/games.js';
import type { SessionRow } from '../../db/repositories/sessions.js';
import type { Database } from '../../db/schema.js';
import type { Kysely } from 'kysely';
import { finalizeBotGame, type FinalizeBotGameDependencies } from './bot-finalize.js';

export interface ClaimBotTimeoutDependencies extends FinalizeBotGameDependencies {
  db: Kysely<Database>;
  now?: () => number;
}

export interface ClaimBotTimeoutResult {
  gameOver: { result: '1-0' | '0-1'; reason: 'timeout' } | null;
}

/** Odd plies are White's — the side to move next is the opposite of
 * whoever just played session.currentPly (matches play-moves.ts's own
 * ply-parity convention). */
export function moverToMoveNext(currentPly: number): 'white' | 'black' {
  return currentPly % 2 === 0 ? 'white' : 'black';
}

/**
 * The clock display's own "my countdown hit 0" trigger calls this — the
 * server re-derives elapsed time from real timestamps (never trusts a
 * client-supplied "it's zero" claim) before awarding anything, so a call
 * that lands early (a move committed in the same instant, or plain clock
 * drift) is a safe no-op rather than a wrongful loss. commitBotTurn itself
 * never rejects a move for running over — this endpoint is the one place a
 * timed bot game's clock is actually enforced, matching how a client-side
 * chess clock has to work without a server-push channel (see the "Play vs
 * Bot" plan's clock phase notes).
 */
export async function claimBotGameTimeout(
  deps: ClaimBotTimeoutDependencies,
  session: SessionRow,
  game: GameRow
): Promise<ClaimBotTimeoutResult> {
  if (game.clockInitialMs === null) return { gameOver: null };

  const now = deps.now ?? Date.now;
  const lastMoveAt = game.lastMoveAt ?? session.startedAt;
  const elapsedSinceLastMove = now() - lastMoveAt.getTime();

  const moverColor = moverToMoveNext(session.currentPly);
  const remaining = moverColor === 'white' ? game.whiteRemainingMs : game.blackRemainingMs;
  if (remaining === null || remaining - elapsedSinceLastMove > 0) return { gameOver: null };

  const result: '1-0' | '0-1' = moverColor === 'white' ? '0-1' : '1-0';
  await finalizeBotGame(deps, session, session.currentPly, result);
  return { gameOver: { result, reason: 'timeout' } };
}
