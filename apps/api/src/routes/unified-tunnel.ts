import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { RawData } from 'ws';
import * as analysesRepo from '../db/repositories/analyses.js';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import * as userProfileService from '../services/user-profile.js';
import type { TunnelConnection, UnifiedTunnelRegistry } from '../services/engine/unified-tunnel-registry.js';

/**
 * The browser-facing leg of the unified tunnel (engine, fetch and local-LLM
 * requests share this one socket) — the api process only, since this is the
 * only process that ever holds the connection. Every open tab registers; new
 * requests go to the one the user used most recently, and the next one takes
 * over when it closes (UnifiedTunnelRegistry.registerConnection()).
 *
 * The connection is always registered under the authenticated user's own id.
 * Never accept a user id from the client (query string, message, header): a
 * registered socket receives that user's coach prompts and answers their
 * engine requests, so a client-chosen id would let any signed-in user take
 * over someone else's tunnel.
 */
export function registerUnifiedTunnelRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  registry: UnifiedTunnelRegistry,
  jobQueue: JobQueue
): void {
  app.get('/api/tunnel', { websocket: true }, async (socket, request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const connection: TunnelConnection = {
      send: (message: string) => socket.send(message),
      onmessage: null
    };
    // Only the tab that brings the user from zero connections to one counts
    // as "the tunnel connected" — without this, several tabs open (or
    // reconnecting together after a network blip) each fire their own
    // resume, duplicating the lookup and the enqueue per extra tab.
    const isFirstConnection = !registry.isConnected(user.id);
    registry.registerConnection(user.id, connection);
    if (isFirstConnection) void resumePausedAnalyses(db, jobQueue, user.id);

    socket.on('message', (raw: RawData) => {
      connection.onmessage?.({ data: rawDataToString(raw) });
    });

    // Pass `connection` so only this tab is dropped; the user's other tabs stay.
    socket.on('close', (code: number) => {
      console.log(`[Unified Tunnel] closed for user ${user.id} (code ${code})`);
      registry.unregisterConnection(user.id, connection);
    });
    console.log(`[Unified Tunnel] connected for user ${user.id}`);
  });
}

/** The moment this user's tunnel connects (a tab opened, or reconnected
 * after a drop), re-enqueue every game whose exhausted engine pipeline may
 * now have a newly available selected source — instead of waiting on a poll,
 * since this is the one moment we know the tunnel is there. Re-running
 * jobs/analyze-game.ts from the top is safe and cheap even for the positions
 * it already finished before pausing: they're already in
 * position_evaluations, so only the genuinely unanalyzed rest costs a real
 * engine call. Fire-and-forget with its own error log — a lookup/enqueue
 * failure must never fail the WebSocket handshake itself. */
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
