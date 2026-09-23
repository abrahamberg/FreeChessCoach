import { z } from 'zod';

/** Messages on the one browser WebSocket (`GET /api/tunnel`) that carries the
 * browser engine, chess-api.com fetches and local-LLM calls. The server sends
 * a request with a `requestId`; the tab answers with a response (or, for
 * `chat-stream`, a run of chunk frames and then `done`). */

export const EngineTunnelPayloadSchema = z.discriminatedUnion('subKind', [
  z.object({
    kind: z.literal('engine'),
    subKind: z.literal('analyze-position'),
    fen: z.string(),
    depth: z.number().int().positive(),
    multiPv: z.number().int().positive(),
    movetimeMs: z.number().int().positive().optional(),
    engine: z.enum(['main', 'lite']).optional()
  }),
  z.object({
    kind: z.literal('engine'),
    subKind: z.literal('analyze-game'),
    fens: z.array(z.string()),
    depth: z.number().int().positive(),
    multiPv: z.number().int().positive(),
    engine: z.enum(['main', 'lite']).optional()
  })
]);
export type EngineTunnelPayload = z.infer<typeof EngineTunnelPayloadSchema>;

export const FetchTunnelPayloadSchema = z.object({
  kind: z.literal('fetch'),
  url: z.string(),
  method: z.string(),
  body: z.string().optional()
});
export type FetchTunnelPayload = z.infer<typeof FetchTunnelPayloadSchema>;

const LocalLlmTargetShape = {
  kind: z.literal('llm'),
  /** The local server's OpenAI-compatible base URL, e.g. http://localhost:1234/v1. */
  baseUrl: z.string(),
  token: z.string().optional()
};

export const LlmTunnelPayloadSchema = z.discriminatedUnion('subKind', [
  z.object({ ...LocalLlmTargetShape, subKind: z.literal('fetch-models') }),
  /** `body` is an OpenAI Chat Completions request, sent as-is. */
  z.object({ ...LocalLlmTargetShape, subKind: z.literal('chat'), body: z.record(z.string(), z.unknown()) }),
  z.object({ ...LocalLlmTargetShape, subKind: z.literal('chat-stream'), body: z.record(z.string(), z.unknown()) })
]);
export type LlmTunnelPayload = z.infer<typeof LlmTunnelPayloadSchema>;

export type TunnelPayload = EngineTunnelPayload | FetchTunnelPayload | LlmTunnelPayload;
export type TunnelRequestMessage = TunnelPayload & { requestId: string };

/** What the tab's `fetch-models` handler returns. `loadedModel` is the model
 * the local server reports as loaded (null when it can't tell), and
 * `contextLength` that model's loaded context window when known. */
export const LocalModelsResultSchema = z.object({
  models: z.array(z.string()),
  loadedModel: z.string().nullable(),
  contextLength: z.number().int().positive().nullable()
});
export type LocalModelsResult = z.infer<typeof LocalModelsResultSchema>;

/** Tab → server. A stream sends `chunk` frames (each one SSE `data:` payload
 * from the local server, unparsed) and ends with `done` or an error. */
export type TunnelResponseMessage =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: string }
  | { requestId: string; chunk: string }
  | { requestId: string; done: true };

/** Control frames that carry no request. A tab sends `active` with the time
 * (its own clock, ms since epoch) the user last used it — on connect, and
 * whenever they load a page in it, switch to it, click or type. The server
 * sends new requests to the user's most recently used tab, since a tab left
 * in the background can be throttled or frozen by the browser. The server
 * answers with `role`, telling each tab whether it is that tab. */
export type TunnelControlMessage =
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'role'; active: boolean }
  | { type: 'active'; at: number }
  | { type: 'cancel'; requestId: string };
