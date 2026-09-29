import { afterEach, describe, expect, test, vi } from 'vitest';
import { ClipPlayer } from './clip-player.js';
import type { ClipTimeline } from './timeline.js';

describe('ClipPlayer', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('playing again (Record during the preview) replaces the running loop: the end fires once', async () => {
    // Animation frames run when the test says so.
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (frames.set(++next, callback), next));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const runFrames = (): void => {
      const due = [...frames.values()];
      frames.clear();
      due.forEach((callback) => callback(0));
    };

    const context = { state: 'running', currentTime: 0, destination: {}, createGain: () => ({ connect: vi.fn(), disconnect: vi.fn() }) } as unknown as AudioContext;
    const onEnd = vi.fn();
    const player = new ClipPlayer({
      canvas: document.createElement('canvas'),
      context,
      timeline: { segments: [], durationMs: 1000 } as unknown as ClipTimeline,
      buffers: new Map(),
      playbackRate: 1,
      frame: {} as never,
      onEnd
    });

    await player.play(0);
    runFrames();
    await player.play(0);
    expect(frames.size).toBe(1);

    (context as { currentTime: number }).currentTime = 2;
    runFrames();
    runFrames();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
