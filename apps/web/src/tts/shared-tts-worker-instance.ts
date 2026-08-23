import { SharedTtsWorker, type SharedTtsWorkerOptions } from './shared-tts-worker.js';

let instance: SharedTtsWorker | null = null;

/** One SharedTtsWorker for the whole app (see SharedTtsWorker's doc
 * comment). Tests that need an isolated fake worker should call
 * resetSharedTtsWorkerForTests() in beforeEach/afterEach. */
export function getSharedTtsWorker(options?: SharedTtsWorkerOptions): SharedTtsWorker {
  if (!instance) instance = new SharedTtsWorker(options);
  return instance;
}

export function resetSharedTtsWorkerForTests(): void {
  instance = null;
}
