import { makeWorkerUtils, type WorkerUtils } from 'graphile-worker';

/** Job enqueueing, abstracted so routes don't depend on graphile-worker directly. */
export interface JobQueue {
  enqueueAnalyzeGame(gameId: string): Promise<void>;
  enqueueSummarizeSession(sessionId: string): Promise<void>;
  /** Task 51.4's one-off backfill (jobs/backfill-game-metadata.ts) — not
   * called by any request-handling code today; exists so the operator can
   * trigger it once after 0023_game_metadata.ts ships (a one-line script or
   * a future admin route), through the same queue every other job uses
   * rather than reaching for graphile-worker directly. */
  enqueueBackfillGameMetadata(): Promise<void>;
}

export const noopJobQueue: JobQueue = {
  enqueueAnalyzeGame: () => Promise.resolve(),
  enqueueSummarizeSession: () => Promise.resolve(),
  enqueueBackfillGameMetadata: () => Promise.resolve()
};

export interface GraphileJobQueueHandle {
  queue: JobQueue;
  close: () => Promise<void>;
}

/** Real `JobQueue`, backed by graphile-worker's job table (architecture: worker
 * runs `analyze-game` jobs from its own deployment; this is the enqueue side). */
export async function createGraphileJobQueue(connectionString: string): Promise<GraphileJobQueueHandle> {
  const workerUtils: WorkerUtils = await makeWorkerUtils({ connectionString });
  await workerUtils.migrate();

  return {
    queue: {
      enqueueAnalyzeGame: async (gameId: string) => {
        await workerUtils.addJob('analyze-game', { gameId });
      },
      enqueueSummarizeSession: async (sessionId: string) => {
        await workerUtils.addJob('summarize-session', { sessionId });
      },
      enqueueBackfillGameMetadata: async () => {
        await workerUtils.addJob('backfill-game-metadata', {});
      }
    },
    close: async () => {
      await workerUtils.release();
    }
  };
}
