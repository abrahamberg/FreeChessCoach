export type LlmCallPriority = 'interactive' | 'background';

interface Waiter {
  priority: LlmCallPriority;
  grant(release: () => void): void;
}

interface UserLane {
  busy: boolean;
  waiting: Waiter[];
}

/**
 * One local-LLM call at a time per user. LM Studio and Ollama on one machine
 * process requests one after another anyway; queueing here instead of there
 * means an interactive coach turn goes ahead of background work (session
 * summaries), no queued call burns its timeout while it waits, and the local
 * server keeps one prompt prefix in its KV cache instead of alternating.
 */
export class LlmCallQueue {
  private lanes = new Map<string, UserLane>();

  /** Waits for this user's slot. The returned function frees it; call it
   * exactly once, when the call (including a whole stream) is over. */
  acquire(userId: string, priority: LlmCallPriority, signal?: AbortSignal): Promise<() => void> {
    const lane = this.laneFor(userId);
    if (!lane.busy) {
      lane.busy = true;
      return Promise.resolve(this.releaser(userId, lane));
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { priority, grant: resolve };
      insertByPriority(lane.waiting, waiter);
      signal?.addEventListener(
        'abort',
        () => {
          const index = lane.waiting.indexOf(waiter);
          if (index === -1) return;
          lane.waiting.splice(index, 1);
          reject(new Error('Local LLM call aborted while queued'));
        },
        { once: true }
      );
    });
  }

  async run<T>(userId: string, priority: LlmCallPriority, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(userId, priority, signal);
    try {
      return await task();
    } finally {
      release();
    }
  }

  private laneFor(userId: string): UserLane {
    const existing = this.lanes.get(userId);
    if (existing) return existing;
    const lane: UserLane = { busy: false, waiting: [] };
    this.lanes.set(userId, lane);
    return lane;
  }

  private releaser(userId: string, lane: UserLane): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = lane.waiting.shift();
      if (next) {
        next.grant(this.releaser(userId, lane));
        return;
      }
      lane.busy = false;
      this.lanes.delete(userId);
    };
  }
}

/** Interactive waiters go after other interactive ones but before every
 * background one; background waiters go to the back. */
function insertByPriority(waiting: Waiter[], waiter: Waiter): void {
  if (waiter.priority === 'background') {
    waiting.push(waiter);
    return;
  }
  const firstBackground = waiting.findIndex((w) => w.priority === 'background');
  if (firstBackground === -1) waiting.push(waiter);
  else waiting.splice(firstBackground, 0, waiter);
}
