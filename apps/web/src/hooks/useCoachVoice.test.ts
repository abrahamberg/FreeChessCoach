import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CoachMessage } from './useCoachChat.js';
import { useCoachVoice, type UseCoachVoiceOptions } from './useCoachVoice.js';

type OnChunk = (index: number, audio: ArrayBuffer) => void;

const { speakMock, openaiSpeakMock } = vi.hoisted(() => ({ speakMock: vi.fn(), openaiSpeakMock: vi.fn() }));

vi.mock('../tts/shared-tts-worker-instance.js', () => ({
  getSharedTtsWorker: () => ({ speak: speakMock })
}));

vi.mock('../tts/openai-tts-client.js', () => ({
  openaiTtsClient: { mimeType: 'audio/mpeg', speak: openaiSpeakMock }
}));

class FakeAudio {
  src = '';
  currentTime = 0;
  private readonly listeners = new Map<string, Set<() => void>>();
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  addEventListener(type: string, callback: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(callback);
  }
  removeEventListener(type: string, callback: () => void): void {
    this.listeners.get(type)?.delete(callback);
  }
  dispatchEnded(): void {
    for (const callback of this.listeners.get('ended') ?? []) callback();
  }
}

let audioInstances: FakeAudio[] = [];

function msg(id: string, role: CoachMessage['role'], text: string): CoachMessage {
  return { id, role, text };
}

/** Every existing test exercises the browser (Kokoro) backend, enabled —
 * this is that baseline, overridable per test. */
function baseProps(overrides: Partial<UseCoachVoiceOptions> = {}): UseCoachVoiceOptions {
  return { messages: [], isStreaming: false, persona: 'general', enabled: true, backend: 'browser', ...overrides };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Lets a test control exactly when chunks arrive and when the stream
 * finishes/fails, instead of the default single-chunk-then-resolve mock. */
function controllableSpeak() {
  let resolve = () => {};
  let reject: (error: Error) => void = () => {};
  let onChunk: OnChunk | null = null;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    impl: (_request: unknown, chunkCallback: OnChunk) => {
      onChunk = chunkCallback;
      return promise;
    },
    emitChunk: (index: number) => onChunk?.(index, new ArrayBuffer(1)),
    done: () => resolve(),
    fail: (message: string) => reject(new Error(message))
  };
}

describe('useCoachVoice', () => {
  beforeEach(() => {
    audioInstances = [];
    speakMock.mockReset();
    openaiSpeakMock.mockReset();
    speakMock.mockImplementation((_request: unknown, onChunk: OnChunk) => {
      onChunk(0, new ArrayBuffer(1));
      return Promise.resolve();
    });
    openaiSpeakMock.mockImplementation((_request: unknown, onChunk: OnChunk) => {
      onChunk(0, new ArrayBuffer(1));
      return Promise.resolve();
    });
    vi.stubGlobal(
      'Audio',
      vi.fn(() => {
        const instance = new FakeAudio();
        audioInstances.push(instance);
        return instance;
      })
    );
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('autoplay toggle defaults to false and persists across mounts', () => {
    const { result } = renderHook(() => useCoachVoice(baseProps()));
    expect(result.current.autoplayEnabled).toBe(false);

    act(() => result.current.setAutoplayEnabled(true));
    expect(result.current.autoplayEnabled).toBe(true);

    const { result: second } = renderHook(() => useCoachVoice(baseProps()));
    expect(second.current.autoplayEnabled).toBe(true);
  });

  test('replaying the same message never re-synthesizes', async () => {
    const { result } = renderHook(() => useCoachVoice(baseProps()));

    await act(async () => {
      result.current.play('m1', 'hello');
      await flush();
    });
    expect(speakMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.play('m1', 'hello');
      await flush();
    });
    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  test('stop() pauses playback and clears playingMessageId', async () => {
    const { result } = renderHook(() => useCoachVoice(baseProps()));

    await act(async () => {
      result.current.play('m1', 'hello');
      await flush();
    });
    expect(result.current.playingMessageId).toBe('m1');

    act(() => result.current.stop());
    expect(result.current.playingMessageId).toBeNull();
    expect(audioInstances[0]?.pause).toHaveBeenCalled();
  });

  test('plays a message\'s chunks in order as they stream in, before advancing past it', async () => {
    const controller = controllableSpeak();
    speakMock.mockImplementation(controller.impl);
    const { result } = renderHook(() => useCoachVoice(baseProps()));

    await act(async () => {
      result.current.play('m1', 'hello there, this is two sentences.');
      await flush();
    });
    // Nothing has arrived yet — still "loading", not "playing".
    expect(result.current.loadingMessageId).toBe('m1');
    expect(result.current.playingMessageId).toBeNull();

    await act(async () => {
      controller.emitChunk(0);
      await flush();
    });
    expect(result.current.loadingMessageId).toBeNull();
    expect(result.current.playingMessageId).toBe('m1');
    expect(audioInstances[0]?.src).toBe('blob:fake-url');

    // First sentence finishes playing before the second sentence's chunk has
    // arrived — playback should wait rather than treating the message as done.
    act(() => audioInstances[0]?.dispatchEnded());
    expect(result.current.playingMessageId).toBe('m1');

    await act(async () => {
      controller.emitChunk(1);
      await flush();
    });
    expect(result.current.playingMessageId).toBe('m1');
    expect(audioInstances[0]?.play).toHaveBeenCalledTimes(2);

    await act(async () => {
      controller.done();
      audioInstances[0]?.dispatchEnded();
      await flush();
    });
    expect(result.current.playingMessageId).toBeNull();
    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  test('autoplay only fires for messages added after a turn finishes, not history seeded at mount', async () => {
    const history = [msg('h1', 'assistant', 'welcome back')];
    const { result, rerender } = renderHook((props) => useCoachVoice(props), {
      initialProps: baseProps({ messages: history })
    });
    act(() => result.current.setAutoplayEnabled(true));
    await act(async () => {
      await flush();
    });
    expect(speakMock).not.toHaveBeenCalled();

    const duringTurn = [...history, msg('u1', 'user', 'hi')];
    rerender(baseProps({ messages: duringTurn, isStreaming: true }));
    const afterTurn = [...duringTurn, msg('a1', 'assistant', 'good to see you')];
    rerender(baseProps({ messages: afterTurn, isStreaming: true }));
    rerender(baseProps({ messages: afterTurn, isStreaming: false }));

    await act(async () => {
      await flush();
    });
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(speakMock).toHaveBeenCalledWith({ text: 'good to see you', voice: 'bm_daniel' }, expect.any(Function));
  });

  test('autoplay off never auto-fires, but explicit play() still works', async () => {
    const { result, rerender } = renderHook((props) => useCoachVoice(props), {
      initialProps: baseProps({ messages: [] })
    });

    rerender(baseProps({ messages: [msg('u1', 'user', 'hi')], isStreaming: true }));
    const afterTurn = [msg('u1', 'user', 'hi'), msg('a1', 'assistant', 'hello there')];
    rerender(baseProps({ messages: afterTurn, isStreaming: false }));
    await act(async () => {
      await flush();
    });
    expect(speakMock).not.toHaveBeenCalled();

    await act(async () => {
      result.current.play('a1', 'hello there');
      await flush();
    });
    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  test('a turn ending on a sentinel-only message does not crash or queue audio', async () => {
    const { result, rerender } = renderHook((props) => useCoachVoice(props), {
      initialProps: baseProps({ messages: [] })
    });
    act(() => result.current.setAutoplayEnabled(true));

    rerender(baseProps({ messages: [msg('u1', 'user', '[board_move] I played e4 (position now: fen)')], isStreaming: true }));
    const afterTurn = [
      msg('u1', 'user', '[board_move] I played e4 (position now: fen)'),
      msg('a1', 'assistant', '[position_divider]|2|e4')
    ];
    rerender(baseProps({ messages: afterTurn, isStreaming: false }));

    await act(async () => {
      await flush();
    });
    expect(speakMock).not.toHaveBeenCalled();
  });

  test('a turn producing multiple prose bubbles queues and plays them in order', async () => {
    const { result, rerender } = renderHook((props) => useCoachVoice(props), {
      initialProps: baseProps({ messages: [] })
    });
    act(() => result.current.setAutoplayEnabled(true));

    rerender(baseProps({ messages: [msg('u1', 'user', 'hi')], isStreaming: true }));
    const afterTurn = [
      msg('u1', 'user', 'hi'),
      msg('a1', 'assistant', 'first line'),
      msg('a2', 'assistant', '[position_divider]|2|e4'),
      msg('a3', 'assistant', 'second line')
    ];
    rerender(baseProps({ messages: afterTurn, isStreaming: false }));

    await act(async () => {
      await flush();
    });
    expect(result.current.playingMessageId).toBe('a1');
    expect(speakMock).toHaveBeenCalledTimes(1);

    act(() => audioInstances[0]?.dispatchEnded());
    await act(async () => {
      await flush();
    });
    expect(result.current.playingMessageId).toBe('a3');
    expect(speakMock).toHaveBeenCalledTimes(2);
    expect(speakMock).toHaveBeenNthCalledWith(1, { text: 'first line', voice: 'bm_daniel' }, expect.any(Function));
    expect(speakMock).toHaveBeenNthCalledWith(2, { text: 'second line', voice: 'bm_daniel' }, expect.any(Function));
  });

  test('disabled (master switch off): play() is a no-op', async () => {
    const { result } = renderHook(() => useCoachVoice(baseProps({ enabled: false })));

    await act(async () => {
      result.current.play('m1', 'hello');
      await flush();
    });

    expect(speakMock).not.toHaveBeenCalled();
    expect(result.current.playingMessageId).toBeNull();
  });

  test('disabled (master switch off): autoplay never fires even with autoplayEnabled true', async () => {
    const { result, rerender } = renderHook((props) => useCoachVoice(props), {
      initialProps: baseProps({ messages: [], enabled: false })
    });
    act(() => result.current.setAutoplayEnabled(true));

    rerender(baseProps({ messages: [msg('u1', 'user', 'hi')], isStreaming: true, enabled: false }));
    const afterTurn = [msg('u1', 'user', 'hi'), msg('a1', 'assistant', 'hello there')];
    rerender(baseProps({ messages: afterTurn, isStreaming: false, enabled: false }));

    await act(async () => {
      await flush();
    });
    expect(speakMock).not.toHaveBeenCalled();
  });

  test('backend "openai" plays through the OpenAI client, not Kokoro', async () => {
    const { result } = renderHook(() => useCoachVoice(baseProps({ backend: 'openai' })));

    await act(async () => {
      result.current.play('m1', 'hello');
      await flush();
    });

    expect(openaiSpeakMock).toHaveBeenCalledWith({ text: 'hello', persona: 'general' }, expect.any(Function));
    expect(speakMock).not.toHaveBeenCalled();
    expect(result.current.playingMessageId).toBe('m1');
  });
});
