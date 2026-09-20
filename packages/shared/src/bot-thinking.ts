import { z } from 'zod';

/** One timed thing the bot did while choosing a move — "Opening book
 * lookup", "Engine search, attempt 1 of 3", "Choosing move", ... —
 * with wall-clock start/end (epoch ms) so the UI can show when it began, how
 * long it took, and what is still running right now. `endedAt` is null exactly
 * while `status` is 'running'. */
export const BotThinkingStepSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  /** Free-form extra context ("depth 18, 40 lines, capped at 8000ms",
   * "returned 5 lines"). Never a raw engine evaluation — AGENTS.md keeps those
   * out of user-facing copy. */
  detail: z.string().optional(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  status: z.enum(['running', 'done', 'failed'])
});
export type BotThinkingStep = z.infer<typeof BotThinkingStepSchema>;

/** Everything one bot move did, from the moment the server started working on
 * it: `source` says whether it came from the player's own move round trip
 * ('turn') or the failover poll ('failover'). `path` and `picked` stay null
 * until the choice is made (and stay null if the move failed before that). */
export const BotThinkingMoveSchema = z.object({
  ply: z.number().int().nullable(),
  source: z.enum(['turn', 'failover']),
  status: z.enum(['thinking', 'done', 'failed']),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  path: z.string().nullable(),
  picked: z.string().nullable(),
  engineMode: z.enum(['internal', 'external', 'browser']).nullable(),
  steps: z.array(BotThinkingStepSchema)
});
export type BotThinkingMove = z.infer<typeof BotThinkingMoveSchema>;

/** GET /api/sessions/:id/bot-thinking — oldest move first, the last entry may
 * still be in flight. */
export const BotThinkingLogSchema = z.object({
  moves: z.array(BotThinkingMoveSchema)
});
export type BotThinkingLog = z.infer<typeof BotThinkingLogSchema>;
