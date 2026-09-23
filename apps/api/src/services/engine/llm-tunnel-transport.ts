import type { LlmTunnelPayload } from '@freechesscoach/shared';
import { LlmCallQueue, type LlmCallPriority } from './llm-call-queue.js';
import { TunnelError, type UnifiedTunnelRegistry } from './unified-tunnel-registry.js';

export interface LlmTunnelCallOptions {
  /** `request`: total time for the answer, counted once the call leaves the
   * queue. `stream`: longest silence between frames. */
  timeoutMs: number;
  priority: LlmCallPriority;
  signal?: AbortSignal;
}

/**
 * Sends local-LLM requests (LM Studio / Ollama, OpenAI-compatible) to the
 * user's browser tab, which calls the local server and answers over the
 * tunnel. Implementations serialize calls per user (LlmCallQueue).
 */
export interface LlmTunnelTransport {
  request(userId: string, payload: LlmTunnelPayload, options: LlmTunnelCallOptions): Promise<unknown>;
  /** Yields each SSE `data:` payload the local server streams, unparsed. */
  stream(userId: string, payload: LlmTunnelPayload, options: LlmTunnelCallOptions): AsyncIterable<string>;
}

export class LlmTunnelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmTunnelError';
  }
}

function toLlmTunnelError(error: unknown): unknown {
  return error instanceof TunnelError ? new LlmTunnelError(error.message) : error;
}

/** The api process's transport: straight to the in-memory registry, through
 * one per-user queue shared by every caller (including worker calls that
 * arrive over the internal relay). */
export class LlmTunnelAdapter implements LlmTunnelTransport {
  constructor(
    private readonly registry: UnifiedTunnelRegistry,
    private readonly queue: LlmCallQueue = new LlmCallQueue()
  ) {}

  async request(userId: string, payload: LlmTunnelPayload, options: LlmTunnelCallOptions): Promise<unknown> {
    try {
      return await this.queue.run(
        userId,
        options.priority,
        () => this.registry.request(userId, payload, options.timeoutMs, options.signal),
        options.signal
      );
    } catch (error) {
      throw toLlmTunnelError(error);
    }
  }

  async *stream(userId: string, payload: LlmTunnelPayload, options: LlmTunnelCallOptions): AsyncGenerator<string> {
    const release = await this.queue.acquire(userId, options.priority, options.signal);
    try {
      yield* this.registry.stream(userId, payload, { idleTimeoutMs: options.timeoutMs, signal: options.signal });
    } catch (error) {
      throw toLlmTunnelError(error);
    } finally {
      release();
    }
  }
}
