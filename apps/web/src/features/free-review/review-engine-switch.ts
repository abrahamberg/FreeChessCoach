import type { EngineEval } from '@freechesscoach/shared';
import type { ReviewEngine, ReviewEngineStatus } from './review-engine-choice.js';
import { ServerEngineUnavailableError } from './server-review-engine.js';

export type AnalyzeBatch = (fens: string[], multiPv: number) => Promise<EngineEval[]>;

/** The device counts as slow when a batch after the first takes this long a
 * position on average (depth 12, three lines; a recent laptop takes well
 * under a second), or the first batch, which includes starting the engine
 * and its first download, takes longer than `SLOW_FIRST_BATCH_MS`. */
export const SLOW_MS_PER_POSITION = 2500;
export const SLOW_FIRST_BATCH_MS = 30_000;

export interface ReviewEngineSwitchDeps {
  device: AnalyzeBatch;
  server: AnalyzeBatch;
  now?: () => number;
}

/**
 * Which engine the free review runs on, decided batch by batch. It starts
 * where `initial` says; a slow device moves to the server unless the visitor
 * chose the device themselves, and a server refusal moves back to the
 * device for good (this page), so a review always finishes. One per page:
 * the choice and a refusal carry over to the next game.
 */
export class ReviewEngineSwitch {
  private current: ReviewEngineStatus;
  private serverRefused = false;
  private deviceBatches = 0;
  private usedNow = new Set<ReviewEngine>();
  private readonly listeners = new Set<(status: ReviewEngineStatus) => void>();
  private readonly now: () => number;

  constructor(
    initial: ReviewEngineStatus,
    private readonly deps: ReviewEngineSwitchDeps
  ) {
    this.current = initial;
    this.now = deps.now ?? (() => performance.now());
  }

  get status(): ReviewEngineStatus {
    return this.current;
  }

  subscribe(listener: (status: ReviewEngineStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The engines that answered since `beginReview`, for the page's notice. */
  get used(): ReviewEngine[] {
    return [...this.usedNow];
  }

  beginReview(): void {
    this.usedNow = new Set();
  }

  /** The visitor's own pick; it takes effect from the next batch. */
  choose(engine: ReviewEngine): void {
    if (engine === 'server') this.serverRefused = false;
    this.set({ engine, reason: 'chosen' });
  }

  analyze: AnalyzeBatch = async (fens, multiPv) => {
    if (this.current.engine === 'server' && !this.serverRefused) {
      try {
        const evals = await this.deps.server(fens, multiPv);
        this.usedNow.add('server');
        return evals;
      } catch (error) {
        if (!(error instanceof ServerEngineUnavailableError)) throw error;
        this.serverRefused = true;
        this.set({ engine: 'device', reason: 'server_unavailable' });
      }
    }
    return this.onDevice(fens, multiPv);
  };

  private async onDevice(fens: string[], multiPv: number): Promise<EngineEval[]> {
    const started = this.now();
    const evals = await this.deps.device(fens, multiPv);
    const elapsed = this.now() - started;
    const first = this.deviceBatches === 0;
    this.deviceBatches += 1;
    this.usedNow.add('device');
    const slow = first ? elapsed > SLOW_FIRST_BATCH_MS : elapsed / Math.max(1, fens.length) > SLOW_MS_PER_POSITION;
    if (slow && this.mayMoveToServer()) this.set({ engine: 'server', reason: 'slow_measured' });
    return evals;
  }

  private mayMoveToServer(): boolean {
    return !this.serverRefused && this.current.reason !== 'chosen' && this.current.reason !== 'link';
  }

  private set(status: ReviewEngineStatus): void {
    this.current = status;
    for (const listener of this.listeners) listener(status);
  }
}
