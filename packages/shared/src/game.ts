import { z } from 'zod';
import { AnalysisStatusSchema } from './analysis.js';

export const GameSourceSchema = z.enum(['paste', 'upload', 'lichess', 'coach_play', 'vs_bot', 'chesscom']);
export type GameSource = z.infer<typeof GameSourceSchema>;

/** architecture §14: 'coach_play' is set only by createPlaySession
 * (server-side, POST /api/sessions/play) — never a client-supplied import
 * source, so ImportGameRequestSchema below deliberately excludes it. Same
 * reasoning applies to 'vs_bot', set only by createBotSession. */
export const ImportableGameSourceSchema = z.enum(['paste', 'upload', 'lichess', 'chesscom']);
export type ImportableGameSource = z.infer<typeof ImportableGameSourceSchema>;

export const PlayerColorSchema = z.enum(['white', 'black']);
export type PlayerColor = z.infer<typeof PlayerColorSchema>;

/** The Games list's four tabs, in ascending stack order — a game is
 * "promoted" up the stack (imported/bot -> review -> coach), never down.
 * `imported`/`bot` sit at the same rung (rank 0): both are a game's
 * unpromoted starting tier, distinguished only by `source`, and either can
 * be promoted straight to `review` or straight to `coach`. */
export const GAME_REVIEW_TIERS = ['imported', 'bot', 'review', 'coach'] as const;
export const GameReviewTierSchema = z.enum(GAME_REVIEW_TIERS);
export type GameReviewTier = z.infer<typeof GameReviewTierSchema>;

const REVIEW_TIER_RANK: Record<GameReviewTier, number> = { imported: 0, bot: 0, review: 1, coach: 2 };

/** A promotion is only ever "up" the stack — strictly higher rank than the
 * game's current tier. Used both server-side (promoteGame's own guard) and
 * client-side (which promote buttons a row offers). */
export function canPromoteGameReviewTier(current: GameReviewTier, target: GameReviewTier): boolean {
  return REVIEW_TIER_RANK[target] > REVIEW_TIER_RANK[current];
}

/** The top of the stack — nothing can ever promote a game further than this.
 * A UI deciding "is there anywhere left to promote this game to" should ask
 * this rather than comparing `tier === 'coach'` directly, so a future tier
 * added above `coach` only needs this one definition updated. */
export function isTopReviewTier(tier: GameReviewTier): boolean {
  return REVIEW_TIER_RANK[tier] === Math.max(...Object.values(REVIEW_TIER_RANK));
}

/** A freshly-created game's starting tier, derived from `source` — never
 * client-supplied (see games repository's `insert`, the only place a game
 * row is created). `coach_play` already IS a coaching session by
 * construction (architecture §14), so it starts at the top of the stack
 * with nothing left to promote; `vs_bot` starts at `bot`; every importable
 * source starts at `imported`. */
export function defaultReviewTierForSource(source: GameSource): GameReviewTier {
  if (source === 'vs_bot') return 'bot';
  if (source === 'coach_play') return 'coach';
  return 'imported';
}

export const ImportGameRequestSchema = z.object({
  pgn: z.string().min(1),
  source: ImportableGameSourceSchema,
  userColor: PlayerColorSchema.optional(),
  /** Stat-bank import (Phase 31): skip queuing the standard-depth analysis
   * job at import time, so bulk-importing games for the stats dashboard
   * doesn't force a full coaching session's worth of engine work per game.
   * Defaults to `false` — every existing call site is unaffected. */
  deferAnalysis: z.boolean().optional()
});
export type ImportGameRequest = z.infer<typeof ImportGameRequestSchema>;

export const ImportGameResponseSchema = z.object({
  gameId: z.string().min(1),
  /** Null iff the request set `deferAnalysis: true` — no `analyses` row
   * exists yet for the game. */
  analysisId: z.string().min(1).nullable()
});
export type ImportGameResponse = z.infer<typeof ImportGameResponseSchema>;

/** design.md §4.2: "From Lichess" picker row — same shape ImportGameRequestSchema
 * needs (pgn, source: 'lichess') plus display fields for the row itself. */
export const LichessRecentGameSchema = z.object({
  id: z.string(),
  pgn: z.string(),
  whiteName: z.string().nullable(),
  blackName: z.string().nullable(),
  result: z.string().nullable(),
  timeControl: z.string().nullable(),
  playedAt: z.string().nullable()
});
export type LichessRecentGame = z.infer<typeof LichessRecentGameSchema>;

export const LichessRecentGamesResponseSchema = z.array(LichessRecentGameSchema);
export type LichessRecentGamesResponse = z.infer<typeof LichessRecentGamesResponseSchema>;

/** Task 51.6: "From Chess.com" picker row — same base shape as
 * LichessRecentGameSchema, plus rated/timeClass/both ratings, which the
 * Chess.com API returns but the existing Lichess client doesn't surface. */
export const ChesscomRecentGameSchema = z.object({
  id: z.string(),
  pgn: z.string(),
  whiteName: z.string().nullable(),
  blackName: z.string().nullable(),
  result: z.string().nullable(),
  timeControl: z.string().nullable(),
  playedAt: z.string().nullable(),
  rated: z.boolean(),
  timeClass: z.string(),
  whiteRating: z.number().int().nullable(),
  blackRating: z.number().int().nullable()
});
export type ChesscomRecentGame = z.infer<typeof ChesscomRecentGameSchema>;

export const ChesscomRecentGamesResponseSchema = z.array(ChesscomRecentGameSchema);
export type ChesscomRecentGamesResponse = z.infer<typeof ChesscomRecentGamesResponseSchema>;

/** design.md §4.1: Games (home) list row — enough to render players/result/status
 * chip without a follow-up request per row. */
export const GameListItemSchema = z.object({
  id: z.string(),
  source: GameSourceSchema,
  userColor: PlayerColorSchema,
  whiteName: z.string().nullable(),
  blackName: z.string().nullable(),
  result: z.string().nullable(),
  timeControl: z.string().nullable(),
  playedAt: z.string().nullable(),
  createdAt: z.string(),
  analysisStatus: AnalysisStatusSchema.nullable(),
  /** architecture §14: only ever set for source === 'coach_play' — the id of
   * its still-resumable session, so the Games list can link straight back in
   * without going through analyze mode's POST /api/sessions (which gates on
   * an `analyses` row a play-mode game never has). Null once that session has
   * ended (completed/abandoned) or, for analyze-mode games, always. */
  sessionId: z.string().nullable(),
  /** Only ever set for source === 'vs_bot' — the BOT_ROSTER id the game was
   * played against, so the Games list can show which bot without a
   * follow-up request. Null for every other source. */
  botId: z.string().nullable(),
  /** Which of the Games page's four tabs this game belongs in — see
   * GAME_REVIEW_TIERS. Defaults for a row persisted before this column
   * existed (a pre-migration DB row is backfilled, but an older cached/
   * fixture response might not carry it). */
  reviewTier: GameReviewTierSchema.default('imported')
});
export type GameListItem = z.infer<typeof GameListItemSchema>;

export const GameListResponseSchema = z.array(GameListItemSchema);
export type GameListResponse = z.infer<typeof GameListResponseSchema>;

/** POST /api/games/:id/promote — moves a game one or more rungs up the
 * stack (see canPromoteGameReviewTier). `imported`/`bot` are never valid
 * targets: nothing is ever demoted, and every game already starts at
 * whichever of those two rungs its source dictates. */
export const PromoteGameRequestSchema = z.object({ tier: z.enum(['review', 'coach']) });
export type PromoteGameRequest = z.infer<typeof PromoteGameRequestSchema>;

export const PromoteGameResponseSchema = z.object({ reviewTier: GameReviewTierSchema });
export type PromoteGameResponse = z.infer<typeof PromoteGameResponseSchema>;
