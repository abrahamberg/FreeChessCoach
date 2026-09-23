import { describe, expect, test } from 'vitest';
import { LlmCallQueue } from './llm-call-queue.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('LlmCallQueue', () => {
  test('never runs two calls for the same user at once', async () => {
    const queue = new LlmCallQueue();
    let running = 0;
    let maxRunning = 0;
    const task = async (): Promise<void> => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
    };
    await Promise.all([queue.run('u', 'background', task), queue.run('u', 'interactive', task), queue.run('u', 'background', task)]);
    expect(maxRunning).toBe(1);
  });

  test('different users do not wait for each other', async () => {
    const queue = new LlmCallQueue();
    const gate = deferred();
    const first = queue.run('a', 'background', () => gate.promise);
    await expect(queue.run('b', 'background', async () => 'ran')).resolves.toBe('ran');
    gate.resolve();
    await first;
  });

  test('an interactive call jumps queued background calls', async () => {
    const queue = new LlmCallQueue();
    const gate = deferred();
    const order: string[] = [];
    const running = queue.run('u', 'background', () => gate.promise);
    const background = queue.run('u', 'background', async () => {
      order.push('background');
    });
    const interactive = queue.run('u', 'interactive', async () => {
      order.push('interactive');
    });
    gate.resolve();
    await Promise.all([running, background, interactive]);
    expect(order).toEqual(['interactive', 'background']);
  });

  test('an aborted waiter leaves the queue', async () => {
    const queue = new LlmCallQueue();
    const gate = deferred();
    const running = queue.run('u', 'background', () => gate.promise);
    const abort = new AbortController();
    const waiting = queue.run('u', 'interactive', async () => 'never', abort.signal);
    abort.abort();
    await expect(waiting).rejects.toThrow('aborted while queued');
    gate.resolve();
    await running;
    await expect(queue.run('u', 'background', async () => 'next')).resolves.toBe('next');
  });
});
