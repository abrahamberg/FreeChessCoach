import { act, renderHook } from '@testing-library/react';
import { textFrames } from '../../../test/helpers/uiMessageStream.js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { usePuzzleCoachChat } from './usePuzzleCoachChat.js';

function streamResponse(parts: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/plain' } });
}

function problemResponse(title: string): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status: 400 }), {
    status: 400,
    headers: { 'content-type': 'application/problem+json' }
  });
}

describe('usePuzzleCoachChat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Mirrors useCoachChat.test.ts's own case — this hook is a sibling with
  // the same "startPuzzleTurn can throw before reply.hijack()" server
  // contract, but previously had no response.ok check at all: the error
  // body was piped into readCoachStream, which silently failed and left the
  // assistant bubble blank with no explanation to the student.
  test('a non-ok response shows the server\'s error text instead of leaving the assistant bubble blank', async () => {
    const fetchMock = vi.fn().mockResolvedValue(problemResponse('Set up your AI in Settings before coaching.'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePuzzleCoachChat('session-1'));
    await act(async () => {
      await result.current.sendMessage('hi coach');
    });

    const last = result.current.messages.at(-1);
    expect(last?.role).toBe('assistant');
    expect(last?.text).toBe('Set up your AI in Settings before coaching.');
  });

  test('onSetupRequired fires when the AI was never set up', async () => {
    const fetchMock = vi.fn().mockResolvedValue(problemResponse('Set up your AI in Settings before coaching.'));
    vi.stubGlobal('fetch', fetchMock);
    const onSetupRequired = vi.fn();
    const onUnlockRequired = vi.fn();

    const { result } = renderHook(() => usePuzzleCoachChat('session-1', { onSetupRequired, onUnlockRequired }));
    await act(async () => {
      await result.current.sendMessage('hi coach');
    });

    expect(onSetupRequired).toHaveBeenCalledTimes(1);
    expect(onUnlockRequired).not.toHaveBeenCalled();
  });

  test('onUnlockRequired fires with a retry that resends the failed turn, replacing the error bubble in place', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(problemResponse('Unlock your AI setup in Settings with your unlock phrase before coaching.'))
      .mockResolvedValueOnce(streamResponse([...textFrames('Welcome back!')]));
    vi.stubGlobal('fetch', fetchMock);
    const onUnlockRequired = vi.fn();

    const { result } = renderHook(() => usePuzzleCoachChat('session-1', { onUnlockRequired }));
    await act(async () => {
      await result.current.sendMessage('hi coach');
    });

    expect(onUnlockRequired).toHaveBeenCalledTimes(1);
    const messageCountBeforeRetry = result.current.messages.length;

    const retry = onUnlockRequired.mock.calls[0]?.[0] as () => Promise<void>;
    await act(async () => {
      await retry();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.messages.length).toBe(messageCountBeforeRetry);
    expect(result.current.messages.at(-1)?.text).toBe('Welcome back!');
  });

  test('onUnlockRequired never fires for a non-unlock error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(problemResponse('Something else went wrong.'));
    vi.stubGlobal('fetch', fetchMock);
    const onUnlockRequired = vi.fn();

    const { result } = renderHook(() => usePuzzleCoachChat('session-1', { onUnlockRequired }));
    await act(async () => {
      await result.current.sendMessage('hi coach');
    });

    expect(onUnlockRequired).not.toHaveBeenCalled();
  });
});
