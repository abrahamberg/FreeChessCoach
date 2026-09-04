import { SharedEngineWorker, type SharedEngineWorkerOptions } from './shared-engine-worker.js';

let instance: SharedEngineWorker | null = null;
let liteInstance: SharedEngineWorker | null = null;

/** One SharedEngineWorker for the whole app (see SharedEngineWorker's doc
 * comment). Tests that need an isolated fake worker should call
 * resetSharedEngineWorkerForTests() in beforeEach/afterEach. */
export function getSharedEngineWorker(options?: SharedEngineWorkerOptions): SharedEngineWorker {
  if (!instance) instance = new SharedEngineWorker(options);
  return instance;
}

export function resetSharedEngineWorkerForTests(): void {
  instance = null;
}

/** Second, independent singleton driving the lightweight `-lite-single`
 * build — never the same process as `getSharedEngineWorker()`'s full-net
 * worker (see shared-engine-worker.ts's `createWorkerForVariant` for why
 * they must stay separate engines, not a shared one swapping nets). Used
 * only for tunnel 'lite' fulfillment (candidate-move breadth
 * supplementation) and exploratory JIT hints — never for graded/official
 * evaluation. */
export function getSharedLiteEngineWorker(options?: SharedEngineWorkerOptions): SharedEngineWorker {
  if (!liteInstance) liteInstance = new SharedEngineWorker({ wasmVariant: 'lite', ...options });
  return liteInstance;
}

export function resetSharedLiteEngineWorkerForTests(): void {
  liteInstance = null;
}
