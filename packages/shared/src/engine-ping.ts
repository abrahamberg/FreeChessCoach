import { z } from 'zod';
import { ENGINE_MODES } from './constants.js';
import { PositionAnalysisSchema } from './analysis.js';

/** The ping test's default position (settings → Engine → Engine ping test).
 * Chosen to be absent from the pre-built Lichess community eval index, so a
 * ping on it really reaches the engine pipeline's live tiers instead of
 * coming back from the bin in a few milliseconds — type any other FEN into
 * the box and a bin hit is the normal, correct result. */
export const ENGINE_PING_FEN = '2kr3r/pppq1ppp/5b2/3p1p2/1P1N1Bn1/2P1P1P1/P1B2P1P/R2Q1RK1 b - - 0 15';

export const EnginePingRequestSchema = z.object({
  fen: z.string().min(1)
});
export type EnginePingRequest = z.infer<typeof EnginePingRequestSchema>;

/** Which tier of the engine pipeline actually served a result: the pre-built
 * Lichess community eval index (`lichessIndex`), this server's own engine —
 * native process or chess-api.com, both trusted/run server-side
 * (`internalEngine`) — or a user's browser-tunnel engine (`externalEngine`).
 * Canonical definition lives here because it crosses to the client in the
 * ping response; apps/api's engine-source-usage.ts re-exports it. */
export const EngineSourceSchema = z.enum(['lichessIndex', 'internalEngine', 'externalEngine']);
export type EngineSource = z.infer<typeof EngineSourceSchema>;

/** One engine-ping test's answer: the PositionAnalysis the pipeline returned
 * (eval, depth, lines — a Lichess-bin hit carries the community's stored
 * ones) plus what the test measured: which tier served it and how long the
 * whole pipeline took. */
export const EnginePingResponseSchema = PositionAnalysisSchema.extend({
  engineMode: z.enum(ENGINE_MODES),
  source: EngineSourceSchema,
  elapsedMs: z.number().int().nonnegative()
});
export type EnginePingResponse = z.infer<typeof EnginePingResponseSchema>;
