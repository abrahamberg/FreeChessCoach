import { describe, expect, test, vi } from 'vitest';
import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import type { PositionAnalysis, PositionAnalysisLine } from '@freechesscoach/shared';
import type { EngineBackend } from './engine-backend.js';
import type { EngineTunnelTransport } from './engine-tunnel-transport.js';
import { LiteSupplementedEngineBackend } from './lite-supplemented-engine-backend.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// 20 legal moves in the start position — comfortably more than any multiPv
// this suite requests, so "the position doesn't have that many moves" never
// masks the shortfall behavior under test.
const START_FEN_LEGAL_MOVE_COUNT = computePositionFeatures(START_FEN).availableMoves.length;

function line(moveSan: string, cp: number): PositionAnalysisLine {
  return { moveUci: `${moveSan}-uci`, moveSan, pvSan: [moveSan], cp, mateIn: null };
}

function analysisWithLines(lines: PositionAnalysisLine[]): PositionAnalysis {
  return {
    fen: START_FEN,
    depth: 18,
    multiPv: lines.length,
    bestMove: lines[0]?.moveSan ?? null,
    eval: { cp: lines[0]?.cp ?? null, mateIn: null },
    lines,
    features: computePositionFeatures(START_FEN)
  };
}

function fakeMain(result: PositionAnalysis): EngineBackend {
  return {
    analyzePosition: vi.fn().mockResolvedValue(result),
    analyzeGame: vi.fn().mockResolvedValue([])
  };
}

function fakeTransport(result: unknown): EngineTunnelTransport & { request: ReturnType<typeof vi.fn> } {
  return { request: vi.fn().mockResolvedValue(result) };
}

describe('LiteSupplementedEngineBackend', () => {
  test('does not call the lite tunnel when main already meets the requested multiPv', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30), line('d4', 25)]));
    const transport = fakeTransport(null);
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    const result = await backend.analyzePosition(START_FEN, { multiPv: 2 });

    expect(transport.request).not.toHaveBeenCalled();
    expect(result.lines.map((l) => l.moveSan)).toEqual(['e4', 'd4']);
  });

  test('supplements from the lite engine when main falls short, keeping main line 1 and appending non-duplicate lite lines when the top move agrees', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30)]));
    const liteResult = analysisWithLines([line('e4', 28), line('d4', 20), line('c4', 15)]);
    const transport = fakeTransport(liteResult);
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    const result = await backend.analyzePosition(START_FEN, { multiPv: 5 });

    expect(transport.request).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ kind: 'analyze-position', fen: START_FEN, engine: 'lite' }),
      expect.any(Number)
    );
    expect(result.lines.map((l) => l.moveSan)).toEqual(['e4', 'd4', 'c4']);
  });

  // Regression: the bot asks `main` for depth 18 / multiPv 40
  // (BOT_SEARCH_DEPTH/BOT_CANDIDATE_BREADTH), and this decorator used to
  // forward that same depth/multiPv straight through to the lite tunnel
  // request too — a depth-18, 40-line search on a single-threaded WASM
  // build in someone's browser tab measured 24-38s per bot move in
  // production, routinely hitting the tunnel's own 40s timeout. Lite's
  // request now always uses its own fixed, shallow depth/multiPv/movetime
  // (LITE_SUPPLEMENT_DEPTH/LITE_SUPPLEMENT_MULTI_PV/LITE_SUPPLEMENT_MOVETIME_MS)
  // regardless of what the caller asked `main` for — movetime because depth
  // 8 alone still measured ~14-15s on a slow device, so depth can't be
  // trusted alone to bound the wait.
  test('always requests the lite tunnel at its own fixed depth/multiPv/movetime, regardless of what the caller requested from main', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30)]));
    const liteResult = analysisWithLines([line('d4', 20)]);
    const transport = fakeTransport(liteResult);
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    await backend.analyzePosition(START_FEN, { depth: 18, multiPv: 40 });

    expect(transport.request).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ kind: 'analyze-position', fen: START_FEN, engine: 'lite', depth: 8, multiPv: 6, movetimeMs: 3000 }),
      expect.any(Number)
    );
  });

  test('when lite disagrees on the top move, keeps main line 1 and splices in all of lite\'s other lines (not lite\'s own top move)', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30)]));
    const liteResult = analysisWithLines([line('Nf3', 35), line('d4', 20), line('c4', 15), line('g3', 10), line('b3', 5), line('a3', 0)]);
    const transport = fakeTransport(liteResult);
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    const result = await backend.analyzePosition(START_FEN, { multiPv: 5 });

    // main's own line 1 (e4) stays first and is never displaced by lite's
    // disagreeing top move (Nf3); every other lite line is used, not just
    // the first four — capping lite's contribution short of the bot's real
    // breadth target only guarantees the native fallback discards it anyway.
    expect(result.lines.map((l) => l.moveSan)).toEqual(['e4', 'd4', 'c4', 'g3', 'b3', 'a3']);
  });

  test('falls back to main\'s original result when the lite tunnel request fails', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30)]));
    const transport: EngineTunnelTransport = { request: vi.fn().mockRejectedValue(new Error('no tunnel')) };
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    const result = await backend.analyzePosition(START_FEN, { multiPv: 5 });

    expect(result.lines.map((l) => l.moveSan)).toEqual(['e4']);
  });

  test('does not attempt a lite request when the requested multiPv exceeds the position\'s own legal-move count and main already covers it', async () => {
    const allMoveLines = Array.from({ length: START_FEN_LEGAL_MOVE_COUNT }, (_, i) => line(`m${i}`, 0));
    const main = fakeMain(analysisWithLines(allMoveLines));
    const transport = fakeTransport(null);
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    await backend.analyzePosition(START_FEN, { multiPv: START_FEN_LEGAL_MOVE_COUNT + 20 });

    expect(transport.request).not.toHaveBeenCalled();
  });
});
