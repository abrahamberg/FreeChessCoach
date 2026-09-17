import { act, renderHook, waitFor } from '@testing-library/react';
import { Chess } from 'chess.js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useGameReviewExplore } from './useGameReviewExplore.js';

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

describe('useGameReviewExplore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('closed by default — no engine feedback fetched until open()', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useGameReviewExplore({ ply: 0, fen: START_FEN }));

    expect(result.current.isExploring).toBe(false);
    expect(result.current.divergedLine.line).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('open() enables the sandbox; a local move builds a diverged line and reaches useExploreFeedback as lastMove', async () => {
    // A fresh Response per call — its body stream can only be read once, and
    // opening the sandbox then playing a local move both trigger a fetch.
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(hintResponse([{ moveUci: 'e7e5', moveSan: 'e5', cp: 20, mateIn: null }])));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useGameReviewExplore({ ply: 0, fen: START_FEN }));

    act(() => result.current.open());
    expect(result.current.isExploring).toBe(true);
    await waitFor(() => expect(result.current.exploreFeedback.status).toBe('ready'));

    act(() => result.current.handleLocalMove(E4_FEN, { fenBefore: START_FEN, san: 'e4', mover: 'white' }));

    expect(result.current.divergedLine.line?.moves).toEqual([{ san: 'e4', fen: E4_FEN, uci: 'e2e4' }]);
    await waitFor(() => expect(result.current.exploreFeedback.note?.moveSan).toBe('e4'));
  });

  test('close() exits the diverged line and stops engine feedback', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(hintResponse([{ moveUci: 'e7e5', moveSan: 'e5', cp: 20, mateIn: null }])));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useGameReviewExplore({ ply: 0, fen: START_FEN }));

    act(() => result.current.open());
    act(() => result.current.handleLocalMove(E4_FEN, { fenBefore: START_FEN, san: 'e4', mover: 'white' }));
    await waitFor(() => expect(result.current.divergedLine.line).not.toBeNull());

    act(() => result.current.close());

    expect(result.current.isExploring).toBe(false);
    expect(result.current.divergedLine.line).toBeNull();
    expect(result.current.exploreFeedback.status).toBe('idle');
  });

  test('navigating the real game (ply changes) while a line is open closes the sandbox', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(hintResponse([{ moveUci: 'e7e5', moveSan: 'e5', cp: 20, mateIn: null }])));
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ real }: { real: { ply: number; fen: string } }) => useGameReviewExplore(real),
      { initialProps: { real: { ply: 0, fen: START_FEN } } }
    );

    act(() => result.current.open());
    act(() => result.current.handleLocalMove(E4_FEN, { fenBefore: START_FEN, san: 'e4', mover: 'white' }));
    await waitFor(() => expect(result.current.divergedLine.line).not.toBeNull());

    rerender({ real: { ply: 1, fen: E4_FEN } });

    expect(result.current.isExploring).toBe(false);
    expect(result.current.divergedLine.line).toBeNull();
  });
});
