import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChessApiEngineBackend } from './chess-api-engine-backend.js';
import type { EngineBackend } from './engine-backend.js';
import { FallbackEngineBackend } from './fallback-engine-backend.js';

// Task 77.2: both breakers live on the backend instance, so they carry over
// from one 6-position chunk of the analysis job to the next.

const FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
];

function analysisOf(fen: string): PositionAnalysis {
  return {
    fen,
    depth: 12,
    multiPv: 1,
    bestMove: 'e4',
    eval: { cp: 20, mateIn: null },
    lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 20, mateIn: null }],
    features: {} as PositionAnalysis['features']
  };
}

function evalsOf(fens: string[]): EngineEval[] {
  return fens.map((fen, ply) => ({ ply, fen, depth: 12, lines: [] }));
}

function fakeBackend(): EngineBackend & { analyzePosition: ReturnType<typeof vi.fn>; analyzeGame: ReturnType<typeof vi.fn> } {
  return {
    analyzePosition: vi.fn(async (fen: string) => analysisOf(fen)),
    analyzeGame: vi.fn(async (fens: string[]) => evalsOf(fens))
  };
}

describe('ChessApiEngineBackend circuit breaker', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('after 3 consecutive failures, the next chunk and analyzePosition make no chess-api calls', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    const fallback = fakeBackend();
    const backend = new ChessApiEngineBackend(1000, fetchImpl, 0, fallback);

    await backend.analyzeGame(FENS);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const next = await backend.analyzeGame(FENS);
    await backend.analyzePosition(FENS[0]!);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fallback.analyzePosition).toHaveBeenCalledTimes(7);
    expect(next.map((e) => e.ply)).toEqual([0, 1, 2]);
  });

  test('failures split across chunks still add up to a trip', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    const backend = new ChessApiEngineBackend(1000, fetchImpl, 0, fakeBackend());

    await backend.analyzeGame(FENS.slice(0, 2));
    await backend.analyzeGame(FENS.slice(0, 2));
    await backend.analyzeGame(FENS.slice(0, 2));

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test('a separate instance starts closed', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await new ChessApiEngineBackend(1000, fetchImpl, 0, fakeBackend()).analyzeGame(FENS);

    await new ChessApiEngineBackend(1000, fetchImpl, 0, fakeBackend()).analyzePosition(FENS[0]!);

    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe('FallbackEngineBackend sticky failure', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('once the selected engine fails, later chunks and positions go straight to the fallback', async () => {
    const selected = fakeBackend();
    selected.analyzeGame.mockRejectedValue(new Error('tunnel timed out'));
    const fallback = fakeBackend();
    const backend = new FallbackEngineBackend(selected, fallback, 'native');

    await backend.analyzeGame(FENS);
    await backend.analyzeGame(FENS);
    await backend.analyzePosition(FENS[0]!);

    expect(selected.analyzeGame).toHaveBeenCalledTimes(1);
    expect(selected.analyzePosition).not.toHaveBeenCalled();
    expect(fallback.analyzeGame).toHaveBeenCalledTimes(2);
    expect(fallback.analyzePosition).toHaveBeenCalledTimes(1);
  });

  test('a selected engine that keeps succeeding is never bypassed', async () => {
    const selected = fakeBackend();
    const fallback = fakeBackend();
    const backend = new FallbackEngineBackend(selected, fallback, 'native');

    await backend.analyzeGame(FENS);
    await backend.analyzeGame(FENS);

    expect(selected.analyzeGame).toHaveBeenCalledTimes(2);
    expect(fallback.analyzeGame).not.toHaveBeenCalled();
  });
});
