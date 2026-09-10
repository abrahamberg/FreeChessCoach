import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { usePlayBotMoveSubmit } from './usePlayBotMoveSubmit.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('usePlayBotMoveSubmit ("Play vs Bot" plan)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('a normal turn applies the player move then the bot move, and never calls onGameOver', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        player: { fen: AFTER_E4_FEN, san: 'e4', ply: 1, quality: 'best', elapsedMs: 1200 },
        bot: { fen: START_FEN, san: 'e5', ply: 2, quality: 'best', elapsedMs: 900 },
        gameOver: null,
        whiteRemainingMs: null,
        blackRemainingMs: null
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const onPlayMoveCommitted = vi.fn();
    const onGameOver = vi.fn();

    const { result } = renderHook(() => usePlayBotMoveSubmit('session-1', onPlayMoveCommitted, onGameOver));
    await act(async () => {
      await result.current.submit('e4', 'e2e4');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions/session-1/play-move',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ san: 'e4' }) })
    );
    expect(onPlayMoveCommitted).toHaveBeenCalledTimes(2);
    expect(onPlayMoveCommitted).toHaveBeenNthCalledWith(
      1,
      { fen: AFTER_E4_FEN, san: 'e4', ply: 1, quality: 'best', elapsedMs: 1200 },
      'e2e4'
    );
    const [botResult, botUci] = (onPlayMoveCommitted as ReturnType<typeof vi.fn>).mock.calls[1] as [unknown, string];
    expect(botResult).toEqual({ fen: START_FEN, san: 'e5', ply: 2, quality: 'best', elapsedMs: 900 });
    expect(botUci.length).toBeGreaterThan(0);
    expect(onGameOver).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  test('when the player\'s own move ends the game, onPlayMoveCommitted fires once and onGameOver fires', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        player: { fen: 'mate-fen', san: 'Qh4#', ply: 4, quality: 'best', elapsedMs: 500 },
        bot: null,
        gameOver: { result: '0-1', reason: 'checkmate' },
        whiteRemainingMs: null,
        blackRemainingMs: null
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const onPlayMoveCommitted = vi.fn();
    const onGameOver = vi.fn();

    const { result } = renderHook(() => usePlayBotMoveSubmit('session-1', onPlayMoveCommitted, onGameOver));
    await act(async () => {
      await result.current.submit('Qh4#', 'd8h4');
    });

    expect(onPlayMoveCommitted).toHaveBeenCalledTimes(1);
    expect(onGameOver).toHaveBeenCalledWith({ result: '0-1', reason: 'checkmate' });
  });

  test('onClockUpdate fires once per submit with the post-exchange remaining time', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        player: { fen: AFTER_E4_FEN, san: 'e4', ply: 1, quality: 'best', elapsedMs: 1200 },
        bot: { fen: START_FEN, san: 'e5', ply: 2, quality: 'best', elapsedMs: 900 },
        gameOver: null,
        whiteRemainingMs: 298800,
        blackRemainingMs: 299100
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const onClockUpdate = vi.fn();

    const { result } = renderHook(() => usePlayBotMoveSubmit('session-1', undefined, undefined, onClockUpdate));
    await act(async () => {
      await result.current.submit('e4', 'e2e4');
    });

    expect(onClockUpdate).toHaveBeenCalledTimes(1);
    expect(onClockUpdate).toHaveBeenCalledWith(298800, 299100);
  });

  // Same reasoning as usePlayMoveSubmit's identical test: the board's own
  // optimistic preview makes a move look fully applied well before a real
  // engine search (which can take several seconds) actually returns.
  test('isSubmitting is true while the request is in flight, false once it resolves', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePlayBotMoveSubmit('session-1'));
    expect(result.current.isSubmitting).toBe(false);

    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit('e4', 'e2e4');
    });
    await waitFor(() => expect(result.current.isSubmitting).toBe(true));

    await act(async () => {
      resolveFetch(
        jsonResponse({
          player: { fen: AFTER_E4_FEN, san: 'e4', ply: 1, quality: 'best', elapsedMs: 1200 },
          bot: { fen: START_FEN, san: 'e5', ply: 2, quality: 'best', elapsedMs: 900 },
          gameOver: null,
          whiteRemainingMs: null,
          blackRemainingMs: null
        })
      );
      await submitPromise;
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  test('a 422 response sets error using the problem+json title, and never calls onPlayMoveCommitted/onGameOver', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ type: 'about:blank', title: 'Illegal move: e4', status: 422 }, 422));
    vi.stubGlobal('fetch', fetchMock);
    const onPlayMoveCommitted = vi.fn();
    const onGameOver = vi.fn();

    const { result } = renderHook(() => usePlayBotMoveSubmit('session-1', onPlayMoveCommitted, onGameOver));
    await act(async () => {
      await result.current.submit('e4', 'e2e4');
    });

    await waitFor(() => expect(result.current.error).toBe('Illegal move: e4'));
    expect(onPlayMoveCommitted).not.toHaveBeenCalled();
    expect(onGameOver).not.toHaveBeenCalled();
  });
});
