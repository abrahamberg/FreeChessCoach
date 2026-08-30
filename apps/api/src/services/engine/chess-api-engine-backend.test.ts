import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import { ChessApiEngineBackend } from './chess-api-engine-backend.js';
import { ChessApiError, ChessApiMalformedResponseError } from './chess-api-response.js';
import type { EngineBackend } from './engine-backend.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_D4_E5_FEN = 'rnbqkbnr/ppp2ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2';
// 1. f3 e5 2. g4 Qh4# — a real checkmate, white to move but no legal moves.
const CHECKMATE_FEN = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

function fakeNativeResult(fen: string, cp: number): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multiPv: 1,
    bestMove: 'Nf3',
    eval: { cp, mateIn: null },
    lines: [{ moveUci: 'g1f3', moveSan: 'Nf3', pvSan: ['Nf3'], cp, mateIn: null }],
    features: computePositionFeatures(fen)
  };
}

function fakeFallback(): EngineBackend {
  return { analyzePosition: vi.fn(), analyzeGame: vi.fn() };
}

function fakeFetch(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body)
  });
}

describe('ChessApiEngineBackend', () => {
  afterEach(() => vi.useRealTimers());

  test('analyzePosition maps a single-object response (variants=1) into a PositionAnalysis', async () => {
    const fetchMock = fakeFetch({ move: 'e2e4', san: 'e4', eval: 0.3, mate: null });
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    const result = await backend.analyzePosition(START_FEN, { multiPv: 1 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chess-api.com/v1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ fen: START_FEN, depth: 16, variants: 1 })
      })
    );
    expect(result.bestMove).toBe('e4');
    expect(result.eval).toEqual({ cp: 30, mateIn: null });
    expect(result.lines).toEqual([{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 30, mateIn: null }]);
    expect(result.multiPv).toBe(1);
    expect(result.features.turn).toBe('white');
  });

  test('analyzePosition maps an array response (multiple variants) into multiple lines', async () => {
    const fetchMock = fakeFetch([
      { move: 'e2e4', san: 'e4', eval: 0.3, mate: null, continuationArr: ['e7e5'] },
      { move: 'd2d4', san: 'd4', eval: 0.25, mate: null, continuationArr: ['d7d5'] }
    ]);
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    const result = await backend.analyzePosition(START_FEN, { multiPv: 2 });

    expect(result.lines).toHaveLength(2);
    expect(result.multiPv).toBe(2);
    expect(result.bestMove).toBe('e4');
    expect(result.lines[0]!.pvSan).toEqual(['e4', 'e5']);
    expect(result.lines[1]!.pvSan).toEqual(['d4', 'd5']);
  });

  test('analyzePosition converts the real continuationArr sample into a multi-move PV', async () => {
    const fetchMock = fakeFetch({
      move: 'g1f3',
      san: 'Nf3',
      eval: 0.62,
      mate: null,
      continuationArr: [
        'e5d4',
        'f3d4',
        'g8f6',
        'b1c3',
        'f8e7',
        'g2g3',
        'b8c6',
        'f1g2',
        'e8g8',
        'e1g1',
        'c6d4',
        'd1d4',
        'c7c6',
        'f1e1',
        'c8e6'
      ]
    });
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    const result = await backend.analyzePosition(AFTER_D4_E5_FEN, { multiPv: 1 });

    expect(result.lines[0]!.pvSan).toEqual([
      'Nf3',
      'exd4',
      'Nxd4',
      'Nf6',
      'Nc3',
      'Be7',
      'g3',
      'Nc6',
      'Bg2',
      'O-O',
      'O-O',
      'Nxd4',
      'Qxd4',
      'c6',
      'Re1',
      'Be6'
    ]);
  });

  test('a mate score is reported as mateIn with a null cp', async () => {
    const fetchMock = fakeFetch({ move: 'b7b8q', san: 'b8=Q+', eval: -11.62, mate: -3 });
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    const result = await backend.analyzePosition(START_FEN);

    expect(result.eval).toEqual({ cp: null, mateIn: -3 });
  });

  test('a line with neither eval nor mate (undocumented response shape) is retried, then thrown as ChessApiMalformedResponseError once retries are exhausted', async () => {
    vi.useFakeTimers();
    const fetchMock = fakeFetch({ move: 'e2e4', san: 'e4', eval: undefined, mate: null });
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    const resultPromise = backend.analyzePosition(START_FEN);
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow(ChessApiMalformedResponseError);
    // Initial attempt + 2 retries (MALFORMED_RESPONSE_RETRY_DELAYS_MS.length).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  test('a malformed response on the first attempt succeeds once a retry returns a usable line', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ move: undefined, san: undefined, eval: undefined, mate: null }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ move: 'e2e4', san: 'e4', eval: 0.3, mate: null }) });
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    const resultPromise = backend.analyzePosition(START_FEN);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.eval).toEqual({ cp: 30, mateIn: null });
    vi.useRealTimers();
  });

  test('clamps depth and multiPv to chess-api.com\'s documented maximums', async () => {
    const fetchMock = fakeFetch({ move: 'e2e4', san: 'e4', eval: 0.3, mate: null });
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    await backend.analyzePosition(START_FEN, { depth: 30, multiPv: 10 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chess-api.com/v1',
      expect.objectContaining({ body: JSON.stringify({ fen: START_FEN, depth: 18, variants: 5 }) })
    );
  });

  test('a terminal (checkmate) position is reported without ever calling chess-api.com', async () => {
    const fetchMock = fakeFetch({});
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    const result = await backend.analyzePosition(CHECKMATE_FEN);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ bestMove: null, eval: { cp: null, mateIn: null }, lines: [], multiPv: 0 });
  });

  test('a non-ok HTTP response throws ChessApiError when no fallback is configured', async () => {
    const fetchMock = fakeFetch(null, false, 503);
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    const error = await backend.analyzePosition(START_FEN).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChessApiError);
    // ChessApiError/ChessApiMalformedResponseError extend HttpError so that,
    // on the rare path where they escape all the way to a route handler (no
    // fallback configured, or the fallback also fails), the Fastify error
    // mapper (plugins/error-mapper.ts) renders a proper 503 problem+json
    // instead of a generic, message-less 500.
    expect((error as ChessApiError).status).toBe(503);
  });

  test('a non-ok HTTP response falls back to the given backend for that one position, silently', async () => {
    const fetchMock = fakeFetch(null, false, 503);
    const fallback = fakeFallback();
    const nativeResult = fakeNativeResult(START_FEN, 12);
    vi.mocked(fallback.analyzePosition).mockResolvedValue(nativeResult);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch, 100, fallback);

    const result = await backend.analyzePosition(START_FEN);

    expect(result).toEqual(nativeResult);
    expect(fallback.analyzePosition).toHaveBeenCalledWith(START_FEN, undefined);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('a malformed response that survives all retries falls back to the given backend', async () => {
    vi.useFakeTimers();
    const fetchMock = fakeFetch({ move: 'e2e4', san: 'e4', eval: undefined, mate: null });
    const fallback = fakeFallback();
    const nativeResult = fakeNativeResult(START_FEN, 5);
    vi.mocked(fallback.analyzePosition).mockResolvedValue(nativeResult);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch, 100, fallback);

    const resultPromise = backend.analyzePosition(START_FEN);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual(nativeResult);
    expect(fallback.analyzePosition).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('analyzeGame falls back only for the one position that fails, the rest still come from chess_api', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ move: 'e2e4', san: 'e4', eval: 0.3, mate: null }) })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ move: 'g1f3', san: 'Nf3', eval: 0.1, mate: null }) });
    const fallback = fakeFallback();
    const nativeResult = fakeNativeResult(START_FEN, -5);
    vi.mocked(fallback.analyzePosition).mockResolvedValue(nativeResult);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch, 0, fallback);

    const result = await backend.analyzeGame([START_FEN, START_FEN, START_FEN]);

    expect(fallback.analyzePosition).toHaveBeenCalledTimes(1);
    expect(result[0]!.lines[0]!.moveSan).toBe('e4');
    expect(result[1]!.lines[0]!.moveSan).toBe('Nf3');
    expect(result[2]!.lines[0]!.moveSan).toBe('Nf3');
  });

  test('analyzeGame trips the circuit breaker after 3 consecutive failures and stops calling chess-api.com for the rest of the batch', async () => {
    const fetchMock = fakeFetch(null, false, 503);
    const fallback = fakeFallback();
    vi.mocked(fallback.analyzePosition).mockImplementation((fen) => Promise.resolve(fakeNativeResult(fen, 0)));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch, 0, fallback);

    const fens = [START_FEN, START_FEN, START_FEN, START_FEN, START_FEN];
    const result = await backend.analyzeGame(fens);

    // Only the first 3 positions actually try chess-api.com (and each falls
    // back individually) — the circuit trips after the 3rd consecutive
    // failure, so positions 4 and 5 go straight to the fallback with no
    // chess-api.com call at all.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fallback.analyzePosition).toHaveBeenCalledTimes(5);
    expect(result).toHaveLength(5);
  });

  test('analyzeGame does not trip the circuit breaker on non-consecutive failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ move: 'e2e4', san: 'e4', eval: 0.3, mate: null }) })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ move: 'g1f3', san: 'Nf3', eval: 0.1, mate: null }) });
    const fallback = fakeFallback();
    vi.mocked(fallback.analyzePosition).mockImplementation((fen) => Promise.resolve(fakeNativeResult(fen, 0)));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch, 0, fallback);

    await backend.analyzeGame([START_FEN, START_FEN, START_FEN, START_FEN]);

    // Alternating success/failure never reaches 3 *consecutive* failures, so
    // every position still tries chess-api.com first.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fallback.analyzePosition).toHaveBeenCalledTimes(2);
  });

  test('analyzeGame issues one sequential call per position and returns a lean EngineEval per ply', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ move: 'e2e4', san: 'e4', eval: 0.3, mate: null }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ move: 'e7e5', san: 'e5', eval: 0.2, mate: null }) });
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch);

    const result = await backend.analyzeGame([START_FEN, START_FEN]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { ply: 0, fen: START_FEN, depth: 16, lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 30, mateIn: null }] },
      // 'e7e5' is illegal from START_FEN (this fixture reuses the same fen
      // for both plies) — pvUciToSan degrades to the empty valid-prefix per
      // its graceful-degradation contract, same as Phase 43/44 elsewhere.
      { ply: 1, fen: START_FEN, depth: 16, lines: [{ moveUci: 'e7e5', moveSan: 'e5', pvSan: [], cp: 20, mateIn: null }] }
    ]);
  });

  test('analyzeGame pauses requestDelayMs between sequential calls, but not before the first one', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ move: 'e2e4', san: 'e4', eval: 0.3, mate: null }) });
    const backend = new ChessApiEngineBackend(5000, fetchMock as unknown as typeof fetch, 300);

    const resultPromise = backend.analyzeGame([START_FEN, START_FEN, START_FEN]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await resultPromise;
  });
});
