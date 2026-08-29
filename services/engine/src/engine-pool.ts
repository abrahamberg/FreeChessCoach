import type { EnginePriority } from '@freechesscoach/shared';
import { UciEngine } from './uci.js';

/** Serializes access to a fixed-size pool of `UciEngine` processes: calls beyond
 * the pool size queue and run once an engine frees up.
 *
 * Two waiter queues, not one: a bot's live move-selection call
 * ('interactive') must never sit stuck behind a background batch job's
 * many-position walk (import analysis, deepen-analysis) just because that
 * job happened to start first. `release()` always drains `interactiveWaiters`
 * before `backgroundWaiters`, so an interactive request only ever waits for
 * whichever single position is *currently* in flight, not the whole queue
 * behind it. No preemption of an in-progress search — priority only affects
 * who gets the *next* freed engine. */
export class EnginePool {
  private readonly engines: UciEngine[];
  private readonly idle: UciEngine[];
  private readonly interactiveWaiters: Array<(engine: UciEngine) => void> = [];
  private readonly backgroundWaiters: Array<(engine: UciEngine) => void> = [];

  constructor(size: number, engineFactory: () => UciEngine = () => new UciEngine()) {
    this.engines = Array.from({ length: size }, engineFactory);
    this.idle = [...this.engines];
  }

  async withEngine<T>(fn: (engine: UciEngine) => Promise<T>, priority: EnginePriority = 'background'): Promise<T> {
    const engine = await this.acquire(priority);
    try {
      return await fn(engine);
    } finally {
      this.release(engine);
    }
  }

  async quitAll(): Promise<void> {
    await Promise.all(this.engines.map((engine) => engine.quit()));
  }

  get size(): number {
    return this.engines.length;
  }

  get busy(): number {
    return this.engines.length - this.idle.length;
  }

  private acquire(priority: EnginePriority): Promise<UciEngine> {
    const engine = this.idle.pop();
    if (engine) return Promise.resolve(engine);
    return new Promise((resolve) => {
      const waiters = priority === 'interactive' ? this.interactiveWaiters : this.backgroundWaiters;
      waiters.push(resolve);
    });
  }

  private release(engine: UciEngine): void {
    const next = this.interactiveWaiters.shift() ?? this.backgroundWaiters.shift();
    if (next) {
      next(engine);
      return;
    }
    this.idle.push(engine);
  }
}
