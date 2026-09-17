import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { RawData } from 'ws';
import * as analysesRepo from '../db/repositories/analyses.js';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import * as userProfileService from '../services/user-profile.js';
import type { EngineTunnelRegistry, TunnelConnection } from '../services/engine/engine-tunnel-registry.js';

/**
 * The browser-facing leg of the tunnel — the api process only, since this is
 * the only process that ever holds the connection (see the design plan's
 * header notes on the api/worker split). One connection per user; a second
 * tab replaces the first (EngineTunnelRegistry.registerConnection()).
 *
 * NOTE: this wires against the *actual* EngineTunnelRegistry as implemented
 * in Task 6 (registerConnection/unregisterConnection, registry-owned
 * `connection.onmessage`), which differs from the register/unregister/
 * isConnected/resolveResponse/rejectResponse API described in the original
 * plan text for this task. Per the "no changes to services/engine itself"
 * constraint, the route adapts to the registry rather than the other way
 * around. The registry sets `connection.onmessage` itself (to route
 * correlated responses back to pending requests); this route's only job is
 * to forward each raw WebSocket message into that callback and to forward
 * outbound sends onto the real socket.
 */
export function registerEngineTunnelRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  registry: EngineTunnelRegistry,
  jobQueue: JobQueue
): void {
  app.get('/api/engine-tunnel', { websocket: true }, async (socket, request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const connection: TunnelConnection = {
      send: (message: string) => socket.send(message),
      onmessage: null
    };
    registry.registerConnection(user.id, connection);
    void resumePausedAnalyses(db, jobQueue, user.id);

    socket.on('message', (raw: RawData) => {
      connection.onmessage?.({ data: rawDataToString(raw) });
    });

    // Pass `connection` so a late 'close' from a tab this one already replaced
    // can't evict the live connection (see EngineTunnelRegistry.unregisterConnection).
    socket.on('close', () => registry.unregisterConnection(user.id, connection));
  });
}

/** The moment this user's tunnel connects (a tab opened, or reconnected
 * after a drop), re-enqueue every game whose analysis paused waiting for
 * exactly this (services/analysis.ts's runAnalyzeGameJob, resolve-engine-
 * backend.ts's backgroundJob option) — instead of waiting on a poll, since
 * this is the one moment we actually know the tunnel is there. Re-running
 * jobs/analyze-game.ts from the top is safe and cheap even for the positions
 * it already finished before pausing: they're already in
 * position_evaluations, so only the genuinely unanalyzed rest costs a real
 * engine call. Fire-and-forget with its own error log, same as every other
 * best-effort side effect on this route — a lookup/enqueue failure must
 * never fail the WebSocket handshake itself. */
async function resumePausedAnalyses(db: Kysely<Database>, jobQueue: JobQueue, userId: string): Promise<void> {
  try {
    const gameIds = await analysesRepo.findPausedGameIdsForUser(db, userId);
    for (const gameId of gameIds) {
      await jobQueue.enqueueAnalyzeGame(gameId);
    }
  } catch (error) {
    console.error(`resumePausedAnalyses failed for user ${userId}:`, error);
  }
}

/** `ws`'s 'message' event delivers `Buffer | ArrayBuffer | Buffer[]` depending
 * on fragmentation/binary settings — normalize all three to a string before
 * handing off to the registry's JSON-parsing onmessage handler. */
function rawDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString();
  if (Array.isArray(data)) return Buffer.concat(data).toString();
  return Buffer.from(data).toString();
}
