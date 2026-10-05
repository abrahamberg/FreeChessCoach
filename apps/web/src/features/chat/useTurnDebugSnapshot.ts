import { useEffect, useState } from 'react';
import { z } from 'zod';
import { apiGet, ApiError } from '../../api/client.js';

/** Deliberately loose: the snapshot is the literal object that hit the LLM
 * and the literal object it returned (coach debug mode design doc, "No
 * reshaping of the captured data") — this validates the envelope, not the
 * internal message/part shapes, which vary by provider and step. */
const TimelineEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('model'),
    atMs: z.number(),
    durationMs: z.number(),
    firstOutputMs: z.number().nullable(),
    outputTokens: z.number(),
    finishReason: z.string(),
    calls: z.array(z.string())
  }),
  z.object({ kind: z.literal('tool'), atMs: z.number(), durationMs: z.number(), toolName: z.string(), ok: z.boolean() })
]);

/** How long each model call and server tool of the turn took (api
 * llm/turn-timings.ts), in the order they finished. */
const TurnTimingsSchema = z.object({ totalMs: z.number(), entries: z.array(TimelineEntrySchema) });

export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

const TurnUsageSchema = z.object({
  freshInputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number().nullable(),
  outputTokens: z.number(),
  /** Added with reasoning support. Snapshots written before then have no such
   * field — the stored snapshot is latest-turn-only and overwritten every
   * turn, so this default just keeps the panel readable until the session's
   * next turn rather than 404-ing the first load after a deploy. */
  reasoningTokens: z.number().default(0)
});

export const TurnDebugSnapshotSchema = z.object({
  request: z.object({
    provider: z.string(),
    model: z.string(),
    /** The cached system layers. Absent on pre-upgrade snapshots, where the
     * system blocks were still the head of `messages`. */
    instructions: z.array(z.unknown()).default([]),
    messages: z.array(z.unknown()),
    tools: z.array(z.object({ name: z.string(), description: z.string(), parameters: z.unknown() })),
    maxSteps: z.number(),
    reasoning: z.string().default('provider-default'),
    providerOptions: z.unknown()
  }),
  response: z.object({
    messages: z.array(z.unknown()),
    finishReason: z.string(),
    usage: TurnUsageSchema,
    /** Absent when the provider returns none (e.g. local models): the key is
     * `undefined` server-side, so it never survives the jsonb round-trip. */
    providerMetadata: z.unknown().optional(),
    timings: TurnTimingsSchema
  })
});

export type TurnDebugSnapshot = z.infer<typeof TurnDebugSnapshotSchema>;
export type DebugMessage = { role?: unknown; content?: unknown; providerOptions?: unknown; id?: unknown };

/** One turn in the picker. `snapshot` is null when the stored turn no
 * longer matches the schema (logged in an older format). */
export interface DebugTurnView {
  at: string | null;
  snapshot: TurnDebugSnapshot | null;
}

export type TurnDebugSnapshotState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; turns: DebugTurnView[] };

const DebugTurnsSchema = z.object({ turns: z.array(z.object({ at: z.string(), snapshot: z.unknown() })) });

/** Fetches the session's last coach turns (oldest first) for the debug
 * popup's picker. A session whose turns predate the turn log has only the
 * latest turn, from `/debug/last-turn`. DebugPanel owns triggering this
 * (mounted only while the popup is open); the fetch lives in a hook per
 * AGENTS.md's "data fetching lives in hooks" rule. */
export function useTurnDebugSnapshot(sessionId: string, basePath = '/api/sessions'): TurnDebugSnapshotState {
  const [state, setState] = useState<TurnDebugSnapshotState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const load = async (): Promise<DebugTurnView[]> => {
      const { turns } = await apiGet(`${basePath}/${sessionId}/debug/turns`, DebugTurnsSchema);
      if (turns.length) return turns.map((turn) => ({ at: turn.at, snapshot: TurnDebugSnapshotSchema.safeParse(turn.snapshot).data ?? null }));
      return [{ at: null, snapshot: await apiGet(`${basePath}/${sessionId}/debug/last-turn`, TurnDebugSnapshotSchema) }];
    };
    load()
      .then((turns) => {
        if (!cancelled) setState({ status: 'ready', turns });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError && error.status === 404
            ? 'No completed turn to debug yet.'
            : 'Could not load debug data.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, basePath]);

  return state;
}
