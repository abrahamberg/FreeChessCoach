import type { BotThinkingLog, BotThinkingMove } from '@freechesscoach/shared';
import { randomUUID } from 'node:crypto';
import { createBotMoveTrace, type BotMoveTrace } from './bot-move-trace.js';
import type { BotThinkingMirror } from './bot-thinking-mirror.js';

/** A live diagnostic view of what the bot is doing, not game data: each pod
 * keeps its own moves in memory, and — when a mirror is given (Redis in
 * deployments; the API runs as several pods and a poll can land on a
 * different one) — publishes them so `readLog` on any pod shows all of them.
 * Nothing is persisted beyond the mirror's expiry, and a restart shows less
 * history. The limits keep a long-running API process from growing without
 * bound. */
export const DEFAULT_MAX_MOVES_PER_SESSION = 60;
export const DEFAULT_MAX_TRACKED_SESSIONS = 200;

export interface BotThinkingRegistry {
  start(sessionId: string, move: { source: BotThinkingMove['source']; ply: number | null }): BotMoveTrace;
  /** This pod's own moves for the session, synchronously. */
  getLog(sessionId: string): BotThinkingLog;
  /** What the GET route serves: this pod's moves merged with the other pods'
   * (from the mirror, when there is one) — same as `getLog` without a mirror. */
  readLog(sessionId: string): Promise<BotThinkingLog>;
  /** Drops a trace that turned out not to be a bot move at all (the student's
   * move was illegal, or already ended the game). */
  discard(sessionId: string, trace: BotMoveTrace): void;
}

/** A live move is mirrored at most this often (its last state always is). */
export const DEFAULT_MIRROR_DELAY_MS = 250;

export interface BotThinkingRegistryOptions {
  mirror?: BotThinkingMirror;
  mirrorDelayMs?: number;
  now?: () => number;
  maxMovesPerSession?: number;
  maxSessions?: number;
}

export function createBotThinkingRegistry(options: BotThinkingRegistryOptions = {}): BotThinkingRegistry {
  const now = options.now ?? Date.now;
  const maxMovesPerSession = options.maxMovesPerSession ?? DEFAULT_MAX_MOVES_PER_SESSION;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_TRACKED_SESSIONS;
  const mirror = options.mirror;
  const mirrorDelayMs = options.mirrorDelayMs ?? DEFAULT_MIRROR_DELAY_MS;
  // A Map iterates in insertion order, so the first key is always the session
  // that started a move least recently — re-inserting on every start keeps it so.
  const tracesBySession = new Map<string, TrackedTrace[]>();

  function start(sessionId: string, move: { source: BotThinkingMove['source']; ply: number | null }): BotMoveTrace {
    const id = randomUUID();
    let timer: NodeJS.Timeout | undefined;
    const publish = (): void => {
      if (!mirror) return;
      const settled = trace.snapshot().status !== 'thinking';
      if (settled && timer) clearTimeout(timer);
      if (!settled && timer) return;
      const write = () => {
        timer = undefined;
        mirror.write(sessionId, id, trace.snapshot()).catch((error: unknown) => console.warn('bot thinking mirror write failed', error));
      };
      if (settled) write();
      else timer = setTimeout(write, mirrorDelayMs);
    };
    const trace = createBotMoveTrace({ now, source: move.source, ply: move.ply, onChange: publish });

    const traces = [...(tracesBySession.get(sessionId) ?? []), { id, trace }].slice(-maxMovesPerSession);
    tracesBySession.delete(sessionId);
    tracesBySession.set(sessionId, traces);
    forgetOldestSessionsOverLimit();
    return trace;
  }

  function forgetOldestSessionsOverLimit(): void {
    while (tracesBySession.size > maxSessions) {
      const oldest = tracesBySession.keys().next().value;
      if (oldest === undefined) return;
      tracesBySession.delete(oldest);
    }
  }

  function getLog(sessionId: string): BotThinkingLog {
    return { moves: (tracesBySession.get(sessionId) ?? []).map(({ trace }) => trace.snapshot()) };
  }

  async function readLog(sessionId: string): Promise<BotThinkingLog> {
    if (!mirror) return getLog(sessionId);

    const merged = new Map<string, BotThinkingMove>();
    for (const { id, move } of await mirror.read(sessionId)) merged.set(id, move);
    // This pod's copy is never older than what it published.
    for (const { id, trace } of tracesBySession.get(sessionId) ?? []) merged.set(id, trace.snapshot());
    const moves = [...merged.values()].sort((a, b) => a.startedAt - b.startedAt).slice(-maxMovesPerSession);
    return { moves };
  }

  function discard(sessionId: string, trace: BotMoveTrace): void {
    const tracked = tracesBySession.get(sessionId) ?? [];
    const gone = tracked.find((candidate) => candidate.trace === trace);
    const remaining = tracked.filter((candidate) => candidate !== gone);
    if (remaining.length === 0) tracesBySession.delete(sessionId);
    else tracesBySession.set(sessionId, remaining);
    if (mirror && gone) mirror.remove(sessionId, gone.id).catch((error: unknown) => console.warn('bot thinking mirror remove failed', error));
  }

  return { start, getLog, readLog, discard };
}

interface TrackedTrace {
  id: string;
  trace: BotMoveTrace;
}

/** The one registry the running API uses — request-scoped bot dependencies
 * (routes/sessions.ts) and the GET route both read it, so a poll sees the
 * move another request is still working on. */
export const botThinkingRegistry = createBotThinkingRegistry();
