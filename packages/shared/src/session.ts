import { z } from 'zod';
import { MoveQualitySchema } from './analysis.js';
import { FindingSchema, FocusAreaUpdateSchema } from './finding.js';
import { PlayerColorSchema } from './game.js';

export const SessionStatusSchema = z.enum(['active', 'completed', 'paused_no_credits', 'abandoned']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/** 'analyze': walking through an already-finished imported game (today's only
 * mode). 'play': a live sparring game against the coach — see architecture.md
 * §14 for the full play-mode design. 'play_bot': a live sparring game against
 * a silent Stockfish-driven bot (see the "Play vs Bot" plan) — no chat/coach
 * turns, moves committed synchronously via play-move. */
export const SessionModeSchema = z.enum(['analyze', 'play', 'play_bot']);
export type SessionMode = z.infer<typeof SessionModeSchema>;

export const SessionOutcomeSchema = z.object({
  sessionSummary: z.string(),
  homework: z.string().nullable(),
  findings: z.array(FindingSchema).max(10),
  focusAreaUpdates: z.array(FocusAreaUpdateSchema).max(4)
});
export type SessionOutcome = z.infer<typeof SessionOutcomeSchema>;

export const CreateSessionRequestSchema = z.object({
  gameId: z.string().min(1)
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

/** architecture §14: starts a fresh live sparring game — no gameId, since
 * play mode creates its own `coach_play` game rather than importing one. */
export const CreatePlaySessionRequestSchema = z.object({
  studentColor: PlayerColorSchema
});
export type CreatePlaySessionRequest = z.infer<typeof CreatePlaySessionRequestSchema>;

/** A chosen time control (0021_bot_game_clock.ts) — both in milliseconds,
 * frozen on the game row at creation. Omitted/null on
 * CreateBotSessionRequestSchema means an untimed game, same as every other
 * game source today. */
export const BotClockConfigSchema = z.object({
  initialMs: z.number().int().positive(),
  incrementMs: z.number().int().nonnegative()
});
export type BotClockConfig = z.infer<typeof BotClockConfigSchema>;

/** Starts a fresh live game against a preset bot — no gameId (play_bot mode
 * creates its own `vs_bot` game, same as play mode does for `coach_play`),
 * plus which roster bot (packages/shared/src/bot-roster.ts) to play. */
export const CreateBotSessionRequestSchema = z.object({
  studentColor: PlayerColorSchema,
  botId: z.string().min(1),
  clock: BotClockConfigSchema.nullable().optional()
});
export type CreateBotSessionRequest = z.infer<typeof CreateBotSessionRequestSchema>;

/** POST /api/sessions/:id/play-move body — the student's move, validated
 * and committed synchronously before any chat turn starts. Reused unchanged
 * as the request body for a play_bot-mode session's move (see
 * CommitBotMoveResponseSchema for that mode's distinct response shape). */
export const CommitPlayerMoveRequestSchema = z.object({
  san: z.string().min(1)
});
export type CommitPlayerMoveRequest = z.infer<typeof CommitPlayerMoveRequestSchema>;

const CommittedBotMoveSchema = z.object({
  fen: z.string(),
  san: z.string(),
  ply: z.number().int().nonnegative(),
  quality: MoveQualitySchema,
  elapsedMs: z.number().int().nonnegative()
});

/** POST /api/sessions/:id/play-move response for a play_bot-mode session —
 * distinct from the plain `{fen,san,ply,quality}` a play-mode move returns,
 * since one request here commits both the student's move AND (unless it
 * already ended the game) the bot's synchronous reply. `bot` is null when
 * the student's own move ended the game first, OR when the engine failed
 * even after its own retries (see `botPending`). Also reused as-is for POST
 * /api/sessions/:id/request-bot-move's response (the failover retry), where
 * there's no new student move to report — `player` is null there. */
export const CommitBotMoveResponseSchema = z.object({
  player: CommittedBotMoveSchema.nullable(),
  bot: CommittedBotMoveSchema.nullable(),
  gameOver: z
    .object({
      result: z.enum(['1-0', '0-1', '1/2-1/2']),
      reason: z.enum([
        'checkmate',
        'stalemate',
        'insufficient_material',
        'threefold_repetition',
        'fifty_move_rule'
      ])
    })
    .nullable(),
  /** Only present for a timed game (see BotClockConfigSchema) — the
   * post-move remaining time for each side, so the client can re-anchor its
   * local ticking clock display against the server's authoritative value
   * instead of drifting across moves. Null/null for an untimed game. */
  whiteRemainingMs: z.number().int().nullable(),
  blackRemainingMs: z.number().int().nullable(),
  /** True iff the bot's reply is still outstanding after every engine retry
   * failed — the student's move (if any) already stands. The client should
   * retry via request-bot-move rather than treat this as an error; see
   * useBotTurnFailover. */
  botPending: z.boolean().optional()
});
export type CommitBotMoveResponse = z.infer<typeof CommitBotMoveResponseSchema>;

/** POST /api/sessions/:id/claim-timeout's response — the client's own
 * ticking clock display calls this the instant it reaches 0; the server
 * re-derives elapsed time from real timestamps rather than trusting the
 * client, so this is a no-op (`gameOver: null`) if the clock actually
 * hasn't expired (e.g. a move landed in the same instant). */
export const ClaimBotTimeoutResponseSchema = z.object({
  gameOver: z.object({ result: z.enum(['1-0', '0-1']), reason: z.literal('timeout') }).nullable()
});
export type ClaimBotTimeoutResponse = z.infer<typeof ClaimBotTimeoutResponseSchema>;

export const ClientToolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown()
});
export type ClientToolResult = z.infer<typeof ClientToolResultSchema>;

/** An empty body is valid — it resumes the turn on whatever is already
 * pending in the session's history (e.g. the [session_start] marker) rather
 * than adding new input, mirroring startTurn's own content/clientToolResult
 * being optional. */
export const PostSessionMessageRequestSchema = z.object({
  content: z.string().min(1).optional(),
  clientToolResult: ClientToolResultSchema.optional()
});
export type PostSessionMessageRequest = z.infer<typeof PostSessionMessageRequestSchema>;

/** docs/plan.md Phase 59, Task 59.4 — POST /api/puzzle-sessions body: which
 * assignment (puzzle_assignments row, apps/api/src/db/repositories/puzzle-
 * assignments.ts) to start or resume a session for. Resumes an already-
 * open session for the same assignment rather than starting a second one
 * (resumeOrCreatePuzzleSession), same shape as CreateSessionRequestSchema's
 * gameId. */
export const CreatePuzzleSessionRequestSchema = z.object({
  assignmentId: z.string().min(1)
});
export type CreatePuzzleSessionRequest = z.infer<typeof CreatePuzzleSessionRequestSchema>;

export const ThreadSchema = z.object({
  id: z.number().int(),
  topic: z.string().max(200),
  status: z.enum(['active', 'parked', 'resolved']),
  hypothesis: z.string().max(300).nullable(),
  anchorPly: z.number().int().nonnegative().nullable(),
  anchorFen: z.string().nullable()
});
export type Thread = z.infer<typeof ThreadSchema>;
