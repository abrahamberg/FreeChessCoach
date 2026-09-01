import { ClassifiedMoveSchema, GameReportSchema, MoveQualitySchema } from '@freechesscoach/shared';
import { z } from 'zod';

export const SessionMessageSchema = z.object({
  id: z.coerce.string(),
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.unknown()
});

// .default('analyze') so older fixtures/responses without a mode field
// (pre-Phase-8 data) still parse as today's only mode, rather than failing.
export const SessionDetailSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  status: z.enum(['active', 'completed', 'abandoned']),
  mode: z.enum(['analyze', 'play', 'play_bot']).default('analyze'),
  /** What the conversation is actually about — used to seed initialPly on
   * reopen (useSessionPageData.ts), instead of scanning the transcript for
   * the last show_position (which could be a trailing flashback). */
  subjectPly: z.number(),
  summary: z.string().nullable(),
  homework: z.string().nullable(),
  messages: z.array(SessionMessageSchema)
});

export const ResetSessionResponseSchema = z.object({ id: z.string() });

/** Play mode's live equivalent of ClassifiedMoveSchema (GameMoveQualityRow),
 * trimmed to the fields the board/eval-bar/move-strip actually render —
 * unlike ClassifiedMoveSchema it has no isUserMove/hangsPiece, since nothing
 * downstream reads either (see liveMoveQualities.ts, which fills them in
 * with defaults when merging this into ClassifiedMoveDto's shape). */
export const LiveMoveQualitySchema = z.object({
  ply: z.number().int().nonnegative(),
  moveSan: z.string(),
  mover: z.enum(['white', 'black']),
  quality: MoveQualitySchema,
  cpLoss: z.number().int().nonnegative(),
  bestLineSan: z.array(z.string()),
  evalAfterCp: z.number().int()
});
export type LiveMoveQuality = z.infer<typeof LiveMoveQualitySchema>;

export const GameDetailSchema = z.object({
  id: z.string(),
  pgn: z.string(),
  userColor: z.enum(['white', 'black']),
  whiteName: z.string().nullable(),
  blackName: z.string().nullable(),
  result: z.string().nullable(),
  classifiedMoves: z.array(ClassifiedMoveSchema).nullable(),
  liveMoveQualities: z.array(LiveMoveQualitySchema).nullable().default(null),
  gameReport: GameReportSchema.nullable().default(null),
  botId: z.string().nullable().default(null),
  clockInitialMs: z.number().int().nullable().default(null),
  clockIncrementMs: z.number().int().nullable().default(null),
  whiteRemainingMs: z.number().int().nullable().default(null),
  blackRemainingMs: z.number().int().nullable().default(null)
});

/** POST /api/sessions/:id/play-move's response (architecture §14). */
export const CommitPlayMoveResponseSchema = z.object({
  fen: z.string(),
  san: z.string(),
  ply: z.number().int().nonnegative(),
  quality: MoveQualitySchema
});

const CommittedBotMoveSchema = z.object({
  fen: z.string(),
  san: z.string(),
  ply: z.number().int().nonnegative(),
  quality: MoveQualitySchema,
  elapsedMs: z.number().int().nonnegative()
});

/** POST /api/sessions/:id/play-move's response for a play_bot-mode session —
 * one request commits both the student's move AND (unless it already ended
 * the game) the bot's synchronous reply. `bot` is null only when the
 * student's own move ended the game first. */
/** POST /api/sessions/:id/undo-bot-move's response — see bot-undo.ts. */
export const UndoBotMoveResponseSchema = z.object({
  fen: z.string(),
  ply: z.number().int().nonnegative()
});

/** POST /api/sessions/:id/resign's response — see bot-resign.ts. Ending the
 * session (SessionSummaryCard taking over) is driven by refetching the
 * session, same as any other bot game-over, so nothing beyond the raw
 * result is needed here. */
export const ResignBotGameResponseSchema = z.object({
  result: z.enum(['1-0', '0-1'])
});

export const CommitBotMoveResponseSchema = z.object({
  player: CommittedBotMoveSchema.nullable(),
  bot: CommittedBotMoveSchema.nullable(),
  gameOver: z
    .object({
      result: z.enum(['1-0', '0-1', '1/2-1/2']),
      reason: z.enum(['checkmate', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule'])
    })
    .nullable(),
  whiteRemainingMs: z.number().int().nullable(),
  blackRemainingMs: z.number().int().nullable(),
  /** True iff the bot's reply is still outstanding after every engine retry
   * failed. See useBotTurnFailover, which retries via request-bot-move. */
  botPending: z.boolean().optional()
});

/** POST /api/sessions/:id/claim-timeout's response — see the shared
 * ClaimBotTimeoutResponseSchema this mirrors. */
export const ClaimBotTimeoutResponseSchema = z.object({
  gameOver: z.object({ result: z.enum(['1-0', '0-1']), reason: z.literal('timeout') }).nullable()
});
