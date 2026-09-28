import { z } from 'zod';

/** How many LLM turns a session keeps for "Debug last answer" to step through. */
export const DEBUG_TURNS_MAX = 20;

/** One coach or practice turn: when, and the literal request/response
 * snapshot (the web validates its shape, as for the latest turn). */
export const DebugTurnSchema = z.object({
  at: z.string(),
  snapshot: z.unknown()
});
export type DebugTurn = z.infer<typeof DebugTurnSchema>;

export const DebugTurnsResponseSchema = z.object({ turns: z.array(DebugTurnSchema) });
export type DebugTurnsResponse = z.infer<typeof DebugTurnsResponseSchema>;
