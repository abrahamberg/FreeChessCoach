import type { CoachPersona } from '@chess-coach/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CoachMessage } from './useCoachChat.js';
import { useCoachVoice } from './useCoachVoice.js';

const { speakMock } = vi.hoisted(() => ({ speakMock: vi.fn() }));

vi.mock('../tts/shared-tts-worker-instance.js', () => ({
  getSharedTtsWorker: () => ({ speak: speakMock })
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

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useCoachVoice', () => {
  beforeEach(() => {
    audioInstances = [];
    speakMock.mockReset();
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
    const { result } = renderHook(() => useCoachVoice({ messages: [], isStreaming: false, persona: 'general' }));
    expect(result.current.autoplayEnabled).toBe(false);

    act(() => result.current.setAutoplayEnabled(true));
    expect(result.current.autoplayEnabled).toBe(true);

    const { result: second } = renderHook(() => useCoachVoice({ messages: [], isStreaming: false, persona: 'general' }));
    expect(second.current.autoplayEnabled).toBe(true);
  });

  test('replaying the same message never re-synthesizes', async () => {
    speakMock.mockResolvedValue(new ArrayBuffer(4));
    const { result } = renderHook(() => useCoachVoice({ messages: [], isStreaming: false, persona: 'general' }));

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
    speakMock.mockResolvedValue(new ArrayBuffer(4));
    const { result } = renderHook(() => useCoachVoice({ messages: [], isStreaming: false, persona: 'general' }));

    await act(async () => {
      result.current.play('m1', 'hello');
      await flush();
    });
    expect(result.current.playingMessageId).toBe('m1');

    act(() => result.current.stop());
    expect(result.current.playingMessageId).toBeNull();
    expect(audioInstances[0]?.pause).toHaveBeenCalled();
  });

  test('autoplay only fires for messages added after a turn finishes, not history seeded at mount', async () => {
    speakMock.mockResolvedValue(new ArrayBuffer(4));
    const history = [msg('h1', 'assistant', 'welcome back')];
    const { result, rerender } = renderHook((props) => useCoachVoice(props), {
      initialProps: { messages: history, isStreaming: false, persona: 'general' as CoachPersona }
    });
    act(() => result.current.setAutoplayEnabled(true));
    await act(async () => {
      await flush();
    });
    expect(speakMock).not.toHaveBeenCalled();

    const duringTurn = [...history, msg('u1', 'user', 'hi')];
    rerender({ messages: duringTurn, isStreaming: true, persona: 'general' });
    const afterTurn = [...duringTurn, msg('a1', 'assistant', 'good to see you')];
    rerender({ messages: afterTurn, isStreaming: true, persona: 'general' });
    rerender({ messages: afterTurn, isStreaming: false, persona: 'general' });

    await act(async () => {
      await flush();
    });
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(speakMock).toHaveBeenCalledWith({ text: 'good to see you', voice: 'af_heart' });
  });

  test('autoplay off never auto-fires, but explicit play() still works', async () => {
    speakMock.mockResolvedValue(new ArrayBuffer(4));
    const { result, rerender } = renderHook((props) => useCoachVoice(props), {
      initialProps: { messages: [] as CoachMessage[], isStreaming: false, persona: 'general' as CoachPersona }
    });

    rerender({ messages: [msg('u1', 'user', 'hi')], isStreaming: true, persona: 'general' });
    const afterTurn = [msg('u1', 'user', 'hi'), msg('a1', 'assistant', 'hello there')];
    rerender({ messages: afterTurn, isStreaming: false, persona: 'general' });
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
      initialProps: { messages: [] as CoachMessage[], isStreaming: false, persona: 'general' as CoachPersona }
    });
    act(() => result.current.setAutoplayEnabled(true));

    rerender({ messages: [msg('u1', 'user', '[board_move] I played e4 (position now: fen)')], isStreaming: true, persona: 'general' });
    const afterTurn = [
      msg('u1', 'user', '[board_move] I played e4 (position now: fen)'),
      msg('a1', 'assistant', '[position_divider]|2|e4')
    ];
    rerender({ messages: afterTurn, isStreaming: false, persona: 'general' });

    await act(async () => {
      await flush();
    });
    expect(speakMock).not.toHaveBeenCalled();
  });

  test('a turn producing multiple prose bubbles queues and plays them in order', async () => {
    speakMock.mockImplementation(async ({ text }: { text: string }) => new TextEncoder().encode(text).buffer);
    const { result, rerender } = renderHook((props) => useCoachVoice(props), {
      initialProps: { messages: [] as CoachMessage[], isStreaming: false, persona: 'general' as CoachPersona }
    });
    act(() => result.current.setAutoplayEnabled(true));

    rerender({ messages: [msg('u1', 'user', 'hi')], isStreaming: true, persona: 'general' });
    const afterTurn = [
      msg('u1', 'user', 'hi'),
      msg('a1', 'assistant', 'first line'),
      msg('a2', 'assistant', '[position_divider]|2|e4'),
      msg('a3', 'assistant', 'second line')
    ];
    rerender({ messages: afterTurn, isStreaming: false, persona: 'general' });

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
    expect(speakMock).toHaveBeenNthCalledWith(1, { text: 'first line', voice: 'af_heart' });
    expect(speakMock).toHaveBeenNthCalledWith(2, { text: 'second line', voice: 'af_heart' });
  });
});
