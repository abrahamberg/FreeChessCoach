import { randomBytes } from 'node:crypto';
import { composeGameReport, keyMomentPly, parsePgn, sharedGamePgn } from '@freechesscoach/chess-analysis';
import type { GameReport, ReviewShareState, SharedReview } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../../db/repositories/analyses.js';
import * as sharesRepo from '../../db/repositories/review-shares.js';
import type { SharedGameRow } from '../../db/repositories/review-shares.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { renderShareImage } from './share-image.js';

/**
 * Growth plan A6: a signed-in player shares one game's review by link. The
 * link is a 128-bit secret on the game (`games.share_token`); anyone with it
 * sees the moves, the notes and the report, never the account. Turning it
 * off clears the token, and sharing again makes a new one, so an old link
 * stays dead. Only a game with a finished Game Report can be shared.
 */
export async function shareState(db: Kysely<Database>, userId: string, gameId: string): Promise<ReviewShareState> {
  const row = await sharesRepo.findTokenForUser(db, gameId, userId);
  if (!row) throw new NotFoundError('Game not found');
  return { token: row.shareToken };
}

export async function shareReview(db: Kysely<Database>, userId: string, gameId: string): Promise<ReviewShareState> {
  const row = await sharesRepo.findTokenForUser(db, gameId, userId);
  if (!row) throw new NotFoundError('Game not found');
  if (row.shareToken) return { token: row.shareToken };
  const report = await analysesRepo.findGameReportByGameId(db, gameId);
  if (!report) throw new ValidationError('This game has no finished review to share yet');
  return { token: await sharesRepo.setTokenIfUnset(db, gameId, userId, randomBytes(16).toString('base64url')) };
}

export async function stopSharing(db: Kysely<Database>, userId: string, gameId: string): Promise<void> {
  if (!(await sharesRepo.clearToken(db, gameId, userId))) throw new NotFoundError('Game not found');
}

/** What the link shows; a wrong or turned-off link is a 404. */
export async function sharedReview(db: Kysely<Database>, token: string): Promise<SharedReview> {
  const { game, report } = await loadShared(db, token);
  return {
    pgn: sharedGamePgn(game.pgn),
    userColor: game.userColor,
    whiteName: game.whiteName,
    blackName: game.blackName,
    result: game.result,
    classifiedMoves: report.moves,
    gameReport: report,
    keyPly: keyMomentPly(report.moves, game.userColor)
  };
}

/** The link preview's picture: the key moment on the board. */
export async function sharedReviewImage(db: Kysely<Database>, token: string): Promise<Buffer> {
  const { game, report } = await loadShared(db, token);
  const ply = keyMomentPly(report.moves, game.userColor);
  const position = parsePgn(game.pgn).positions[ply];
  if (!position) throw new NotFoundError('No review at this link');
  const quality = report.moves.find((move) => move.ply === ply)?.quality ?? null;
  return renderShareImage({ fen: position.fen, uci: position.moveUci, quality, orientation: game.userColor });
}

async function loadShared(db: Kysely<Database>, token: string): Promise<{ game: SharedGameRow; report: GameReport }> {
  const game = await sharesRepo.findByToken(db, token);
  const stored = game ? await analysesRepo.findGameReportByGameId(db, game.id) : undefined;
  if (!game || !stored) throw new NotFoundError('No review at this link');
  return { game, report: composeGameReport(stored, game) };
}
