import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { parsePgn } from '@freechesscoach/chess-analysis';
import type { AnalysisStatus, EngineMode } from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import * as userProfileService from '../services/user-profile.js';

export function registerAnalysesRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  pollIntervalMs: number
): void {
  app.get<{ Params: { id: string } }>('/api/analyses/:id/status', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const analysis = await analysesRepo.findByIdForUser(db, request.params.id, user.id);
    if (!analysis) throw new NotFoundError('Analysis not found');

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    await streamStatusUntilTerminal(db, request.params.id, reply.raw, pollIntervalMs);
  });

  // Global engine-activity indicator (AppShell): unlike the per-id route
  // above, the client has no analysisId to ask about yet — it needs to
  // discover on its own whether *anything* is running, from any page, and
  // keep watching for the rest of the session (see useActiveAnalyses.ts).
  // So this stream never reaches a terminal state on its own; it stays open
  // until the client disconnects.
  app.get('/api/analyses/active', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    await streamActiveAnalyses(db, user.id, user.engineMode, reply.raw, pollIntervalMs);
  });
}

interface ActiveAnalysisFrame {
  engineMode: EngineMode;
  analyses: Array<{
    analysisId: string;
    gameId: string;
    status: AnalysisStatus;
    analyzedPositions: number;
    totalPositions: number;
  }>;
}

/** The client already holds the PGN for the *specific* game it's importing
 * (ImportPage's own positionCountOf) — but this route has no such context, so
 * it derives the same total from the games row's stored `pgn` instead. */
function positionCountOf(pgn: string): number {
  try {
    return parsePgn(pgn).positions.length;
  } catch {
    return 0;
  }
}

function streamActiveAnalyses(
  db: Kysely<Database>,
  userId: string,
  engineMode: EngineMode,
  raw: { write: (chunk: string) => void; on: (event: 'close', listener: () => void) => void },
  pollIntervalMs: number
): Promise<void> {
  return new Promise((resolve) => {
    let lastPayload: string | null = null;
    let stopped = false;
    // The only way this stream ever ends: the client (tab close, navigation
    // away from the SPA, or the browser's own EventSource reconnect cycle)
    // drops the connection. There's no terminal analysis status to watch for
    // here — see the doc comment on the route above.
    raw.on('close', () => {
      stopped = true;
      resolve();
    });

    const tick = async () => {
      if (stopped) return;
      const rows = await analysesRepo.findActiveForUser(db, userId);
      if (stopped) return; // client disconnected while the query above was in flight
      const frame: ActiveAnalysisFrame = {
        engineMode,
        analyses: rows.map((row) => ({
          analysisId: row.id,
          gameId: row.gameId,
          status: row.status,
          analyzedPositions: row.progress,
          totalPositions: positionCountOf(row.pgn)
        }))
      };
      const payload = JSON.stringify(frame);
      if (payload !== lastPayload) {
        lastPayload = payload;
        raw.write(`data: ${payload}\n\n`);
      }
      if (!stopped) setTimeout(() => void tick(), pollIntervalMs);
    };

    void tick();
  });
}

function streamStatusUntilTerminal(
  db: Kysely<Database>,
  analysisId: string,
  raw: { write: (chunk: string) => void; end: () => void },
  pollIntervalMs: number
): Promise<void> {
  return new Promise((resolve) => {
    let lastStatus: string | null = null;
    let lastAnalyzedPositions = -1;

    const tick = async () => {
      const analysis = await analysesRepo.findProgress(db, analysisId);
      const status = analysis?.status ?? null;
      // services/analysis.ts persists engine evals a chunk at a time, so their
      // stored count is how far the engine step has actually got. The client
      // already knows the game's ply count (it holds the PGN) and turns the
      // two into a percentage — no schema change needed to carry progress.
      const analyzedPositions = analysis?.progress ?? 0;

      // Emitted on progress as well as status: `engine_running` covers the
      // whole engine pass, so without this the longest step reports nothing.
      if (status !== null && (status !== lastStatus || analyzedPositions !== lastAnalyzedPositions)) {
        lastStatus = status;
        lastAnalyzedPositions = analyzedPositions;
        raw.write(`data: ${JSON.stringify({ status, analyzedPositions })}\n\n`);
      }

      if (status === null || analysesRepo.TERMINAL_ANALYSIS_STATUSES.has(status)) {
        raw.end();
        resolve();
        return;
      }

      setTimeout(() => void tick(), pollIntervalMs);
    };

    void tick();
  });
}
