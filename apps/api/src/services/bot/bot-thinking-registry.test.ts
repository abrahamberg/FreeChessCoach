import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotThinkingMove } from '@freechesscoach/shared';
import type { BotThinkingMirror } from './bot-thinking-mirror.js';
import { createBotThinkingRegistry } from './bot-thinking-registry.js';

describe('createBotThinkingRegistry', () => {
  it('returns an empty log for a session nothing has been recorded for', () => {
    const registry = createBotThinkingRegistry({ now: () => 0 });
    expect(registry.getLog('nobody')).toEqual({ moves: [] });
  });

  it('shows a move that is still thinking, then the same move once it finishes', () => {
    let clock = 100;
    const registry = createBotThinkingRegistry({ now: () => clock });

    const trace = registry.start('s1', { source: 'turn', ply: 2 });
    const stepId = trace.begin('Engine search');
    expect(registry.getLog('s1').moves).toHaveLength(1);
    expect(registry.getLog('s1').moves[0]).toMatchObject({ status: 'thinking', endedAt: null });

    clock = 900;
    trace.end(stepId);
    trace.complete();
    expect(registry.getLog('s1').moves[0]).toMatchObject({ status: 'done', endedAt: 900 });
  });

  it('keeps moves oldest first and keeps sessions apart', () => {
    const registry = createBotThinkingRegistry({ now: () => 0 });
    registry.start('s1', { source: 'turn', ply: 2 });
    registry.start('s1', { source: 'turn', ply: 4 });
    registry.start('s2', { source: 'turn', ply: 2 });

    expect(registry.getLog('s1').moves.map((move) => move.ply)).toEqual([2, 4]);
    expect(registry.getLog('s2').moves).toHaveLength(1);
  });

  it('drops the oldest moves past the per-session limit', () => {
    const registry = createBotThinkingRegistry({ now: () => 0, maxMovesPerSession: 2 });
    for (const ply of [2, 4, 6]) registry.start('s1', { source: 'turn', ply });

    expect(registry.getLog('s1').moves.map((move) => move.ply)).toEqual([4, 6]);
  });

  it('forgets the least recently started session past the session limit', () => {
    const registry = createBotThinkingRegistry({ now: () => 0, maxSessions: 2 });
    registry.start('a', { source: 'turn', ply: 2 });
    registry.start('b', { source: 'turn', ply: 2 });
    registry.start('c', { source: 'turn', ply: 2 });

    expect(registry.getLog('a').moves).toEqual([]);
    expect(registry.getLog('b').moves).toHaveLength(1);
    expect(registry.getLog('c').moves).toHaveLength(1);
  });

  it('discard removes only that trace and ignores one it no longer holds', () => {
    const registry = createBotThinkingRegistry({ now: () => 0 });
    const first = registry.start('s1', { source: 'turn', ply: 2 });
    registry.start('s1', { source: 'turn', ply: 4 });

    registry.discard('s1', first);
    expect(registry.getLog('s1').moves.map((move) => move.ply)).toEqual([4]);

    registry.discard('s1', first);
    expect(registry.getLog('s1').moves).toHaveLength(1);
  });
});

/** A stand-in for Redis shared by "pods": what one registry writes another reads. */
function fakeMirror() {
  const stored = new Map<string, Map<string, BotThinkingMove>>();
  const mirror: BotThinkingMirror & { writes: number } = {
    writes: 0,
    async write(sessionId, moveId, move) {
      mirror.writes += 1;
      const session = stored.get(sessionId) ?? new Map();
      session.set(moveId, structuredClone(move));
      stored.set(sessionId, session);
    },
    async remove(sessionId, moveId) {
      stored.get(sessionId)?.delete(moveId);
    },
    async read(sessionId) {
      return [...(stored.get(sessionId)?.entries() ?? [])].map(([id, move]) => ({ id, move: structuredClone(move) }));
    }
  };
  return mirror;
}

describe('createBotThinkingRegistry across pods', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a poll answered by another pod sees the move this pod is still working on', async () => {
    const mirror = fakeMirror();
    const podA = createBotThinkingRegistry({ mirror, now: () => 100 });
    const podB = createBotThinkingRegistry({ mirror, now: () => 100 });

    const trace = podA.start('s1', { source: 'turn', ply: 2 });
    trace.begin('Engine search');
    await vi.advanceTimersByTimeAsync(300);

    const seen = await podB.readLog('s1');
    expect(seen.moves).toHaveLength(1);
    expect(seen.moves[0]).toMatchObject({ status: 'thinking', ply: 2 });
    expect(seen.moves[0]?.steps[0]).toMatchObject({ label: 'Engine search', status: 'running' });
  });

  it('shows the moves of different pods together, oldest first', async () => {
    const mirror = fakeMirror();
    let clock = 1000;
    const podA = createBotThinkingRegistry({ mirror, now: () => clock });
    const podB = createBotThinkingRegistry({ mirror, now: () => clock });

    podA.start('s1', { source: 'turn', ply: 2 }).complete();
    clock = 2000;
    podB.start('s1', { source: 'turn', ply: 4 }).complete();

    expect((await podA.readLog('s1')).moves.map((move) => move.ply)).toEqual([2, 4]);
    expect((await podB.readLog('s1')).moves.map((move) => move.ply)).toEqual([2, 4]);
  });

  it('a move that settles is published at once, not after the throttle delay', async () => {
    const mirror = fakeMirror();
    const podA = createBotThinkingRegistry({ mirror, now: () => 0 });
    const trace = podA.start('s1', { source: 'turn', ply: 2 });

    trace.complete();
    await vi.advanceTimersByTimeAsync(0);

    expect((await createBotThinkingRegistry({ mirror }).readLog('s1')).moves[0]).toMatchObject({ status: 'done' });
  });

  it('a burst of step changes is written once per throttle window', async () => {
    const mirror = fakeMirror();
    const registry = createBotThinkingRegistry({ mirror, now: () => 0, mirrorDelayMs: 250 });
    const trace = registry.start('s1', { source: 'turn', ply: 2 });

    for (let i = 0; i < 10; i++) trace.end(trace.begin(`step ${i}`));
    expect(mirror.writes).toBe(0);
    await vi.advanceTimersByTimeAsync(250);

    expect(mirror.writes).toBe(1);
  });

  it('this pod\'s own copy wins over what it published a moment ago', async () => {
    const mirror = fakeMirror();
    const registry = createBotThinkingRegistry({ mirror, now: () => 0, mirrorDelayMs: 250 });
    const trace = registry.start('s1', { source: 'turn', ply: 2 });
    trace.begin('a');
    await vi.advanceTimersByTimeAsync(250);
    trace.begin('b');

    expect((await registry.readLog('s1')).moves[0]?.steps.map((step) => step.label)).toEqual(['a', 'b']);
  });

  it('discard removes the move from the shared copy too', async () => {
    const mirror = fakeMirror();
    const registry = createBotThinkingRegistry({ mirror, now: () => 0 });
    const trace = registry.start('s1', { source: 'turn', ply: null });
    trace.begin('Saving your move');
    await vi.advanceTimersByTimeAsync(300);

    registry.discard('s1', trace);
    await vi.advanceTimersByTimeAsync(0);

    expect((await registry.readLog('s1')).moves).toEqual([]);
  });

  it('a mirror that fails only makes the log show less — the move itself is unaffected', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing: BotThinkingMirror = {
      write: () => Promise.reject(new Error('redis down')),
      remove: () => Promise.reject(new Error('redis down')),
      read: () => Promise.resolve([])
    };
    const registry = createBotThinkingRegistry({ mirror: failing, now: () => 0 });

    const trace = registry.start('s1', { source: 'turn', ply: 2 });
    trace.complete();
    await vi.advanceTimersByTimeAsync(0);

    expect((await registry.readLog('s1')).moves).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
