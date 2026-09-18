import { act, renderHook, waitFor } from '@testing-library/react';
import { Chess } from 'chess.js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { arrowsFromLines, useExploreFeedback } from './useExploreFeedback.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function chessAfter(fen: string, san: string): string {
  const chess = new Chess(fen);
  chess.move(san);
  return chess.fen();
}

const E4_FEN = chessAfter(START_FEN, 'e4');

function hintResponse(lines: { moveUci: string; moveSan: string; cp: number | null; mateIn: number | null }[]): Response {
  return new Response(JSON.stringify({ lines }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('arrowsFromLines', () => {
  test('draws one arrow per line, up to 3, when every candidate is within tolerance of the best', () => {
    const arrows = arrowsFromLines(
      [
        { moveUci: 'e7e5', moveSan: 'e5', cp: 20, mateIn: null },
        { moveUci: 'c7c5', moveSan: 'c5', cp: 15, mateIn: null },
        { moveUci: 'e7e6', moveSan: 'e6', cp: 10, mateIn: null }
      ],
      'black'
    );

    expect(arrows).toEqual([
      { from: 'e7', to: 'e5', color: expect.any(String) },
      { from: 'c7', to: 'c5', color: expect.any(String) },
      { from: 'e7', to: 'e6', color: expect.any(String) }
    ]);
  });

  test('drops a candidate that trails the top line by more than the tolerance, instead of padding to 3', () => {
    // cp is always White-perspective (see useExploreFeedback's own doc
    // comment) — for black to move, a *higher* cp is the worse line.
    const arrows = arrowsFromLines(
      [
        { moveUci: 'e7e5', moveSan: 'e5', cp: 20, mateIn: null },
        { moveUci: 'c7c5', moveSan: 'c5', cp: 15, mateIn: null },
        { moveUci: 'a7a6', moveSan: 'a6', cp: 400, mateIn: null }
      ],
      'black'
    );

    expect(arrows.map((arrow) => arrow.from)).toEqual(['e7', 'c7']);
  });

  test('no lines means no arrows', () => {
    expect(arrowsFromLines([], 'white')).toEqual([]);
  });
});

describe('useExploreFeedback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('does nothing while disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useExploreFeedback({ enabled: false, fen: START_FEN, lastMove: null }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: 'idle', evaluation: null, evalCp: null, arrows: [], highlights: [], note: undefined });
  });

  test('fetches the current position once opened and phrases the eval in words, never a number, with no note until a move is played', async () => {
    const fetchMock = vi.fn().mockResolvedValue(hintResponse([{ moveUci: 'e2e4', moveSan: 'e4', cp: 30, mateIn: null }]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useExploreFeedback({ enabled: true, fen: START_FEN, lastMove: null }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/positions/hint-moves',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ fen: START_FEN }) })
    );
    expect(result.current.evaluation).not.toMatch(/\d/);
    expect(result.current.note).toBeUndefined();
  });

  test('once a move is played, classifies it (reusing the prior fetch as evalBefore — only one new request)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(hintResponse([{ moveUci: 'e2e4', moveSan: 'e4', cp: 30, mateIn: null }]))
      .mockResolvedValueOnce(
        hintResponse([
          { moveUci: 'e7e5', moveSan: 'e5', cp: 20, mateIn: null },
          { moveUci: 'c7c5', moveSan: 'c5', cp: 15, mateIn: null }
        ])
      );
    vi.stubGlobal('fetch', fetchMock);

    type HookProps = Pick<Parameters<typeof useExploreFeedback>[0], 'fen' | 'lastMove'>;
    const { result, rerender } = renderHook(
      ({ fen, lastMove }: HookProps) => useExploreFeedback({ enabled: true, fen, lastMove }),
      { initialProps: { fen: START_FEN, lastMove: null } as HookProps }
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ fen: E4_FEN, lastMove: { fenBefore: START_FEN, san: 'e4', mover: 'white' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // One request for the opening position (on mount) + one for the
    // resulting position — the opening position's own lines are reused as
    // evalBefore instead of being re-fetched.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.note?.moveSan).toBe('e4');
    expect(result.current.note?.quality).toBeDefined();
    expect(result.current.arrows.length).toBeGreaterThan(0);
    // One highlight (the destination square) per arrow — the light
    // background this hook now gives each alternative move.
    expect(result.current.highlights).toHaveLength(result.current.arrows.length);
    expect(result.current.highlights[0]).toEqual({ square: result.current.arrows[0]?.to, color: expect.any(String) });
  });

  test('closing the sandbox (enabled: false) immediately drops the last feedback instead of leaving it stale on screen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(hintResponse([{ moveUci: 'e2e4', moveSan: 'e4', cp: 30, mateIn: null }]));
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useExploreFeedback({ enabled, fen: START_FEN, lastMove: null }),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => rerender({ enabled: false }));

    expect(result.current).toEqual({ status: 'idle', evaluation: null, evalCp: null, arrows: [], highlights: [], note: undefined });
  });
});
