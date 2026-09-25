import { describe, expect, test, vi } from 'vitest';
import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import type { PositionAnalysis, PositionAnalysisLine } from '@freechesscoach/shared';
import { createBotMoveTrace } from '../bot/bot-move-trace.js';
import { newBotMoveDebugCollector } from './bot-move-debug.js';
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
  test('never asks the browser when only the best line is wanted', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30)]));
    const transport = fakeTransport(null);
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'external' });

    const result = await backend.analyzePosition(START_FEN, { multiPv: 1 });

    expect(transport.request).not.toHaveBeenCalled();
    expect(result.lines.map((l) => l.moveSan)).toEqual(['e4']);
  });

  test('starts the browser search before main has answered', async () => {
    let answerMain: (analysis: PositionAnalysis) => void = () => undefined;
    const main: EngineBackend = {
      analyzePosition: vi.fn(() => new Promise<PositionAnalysis>((resolve) => (answerMain = resolve))),
      analyzeGame: vi.fn()
    };
    const transport = fakeTransport(analysisWithLines([line('e4', 28), line('d4', 20)]));
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'external' });

    const pending = backend.analyzePosition(START_FEN, { multiPv: 5 });
    expect(transport.request).toHaveBeenCalledTimes(1);

    answerMain(analysisWithLines([line('e4', 30)]));
    expect((await pending).lines.map((l) => l.moveSan)).toEqual(['e4', 'd4']);
  });

  test('leaves the early browser search unread when main already meets the requested multiPv', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30), line('d4', 25)]));
    const transport = fakeTransport(analysisWithLines([line('e4', 28), line('c4', 20)]));
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'external' });

    const result = await backend.analyzePosition(START_FEN, { multiPv: 2 });

    expect(result.lines.map((l) => l.moveSan)).toEqual(['e4', 'd4']);
  });

  test('a main engine that throws still rethrows while the browser search is in flight', async () => {
    const main: EngineBackend = { analyzePosition: vi.fn().mockRejectedValue(new Error('engine down')), analyzeGame: vi.fn() };
    const transport = { request: vi.fn().mockRejectedValue(new Error('no browser tab connected')) };
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'external' });

    await expect(backend.analyzePosition(START_FEN, { multiPv: 5 })).rejects.toThrow('engine down');
  });

  test('once the light engine fails, later short results are returned as they are, without asking it again', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30)]));
    const transport = { request: vi.fn().mockRejectedValue(new Error('Tunnel request timeout')) };
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    const first = await backend.analyzePosition(START_FEN, { multiPv: 5 });
    const second = await backend.analyzePosition(START_FEN, { multiPv: 5 });

    expect(transport.request).toHaveBeenCalledTimes(1);
    expect(first.lines.map((l) => l.moveSan)).toEqual(['e4']);
    expect(second.lines.map((l) => l.moveSan)).toEqual(['e4']);
  });

  test('supplements from the lite engine when main falls short, keeping main line 1 and appending non-duplicate lite lines when the top move agrees', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30)]));
    const liteResult = analysisWithLines([line('e4', 28), line('d4', 20), line('c4', 15)]);
    const transport = fakeTransport(liteResult);
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    const result = await backend.analyzePosition(START_FEN, { multiPv: 5 });

    expect(transport.request).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ kind: 'engine', subKind: 'analyze-position', fen: START_FEN, engine: 'lite' }),
      expect.any(Number)
    );
    expect(result.lines.map((l) => l.moveSan)).toEqual(['e4', 'd4', 'c4']);
  });

  // Regression: the bot used to ask `main` for depth 18 / multiPv 40, and
  // this decorator used to
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
      expect.objectContaining({ kind: 'engine', subKind: 'analyze-position', fen: START_FEN, engine: 'lite', depth: 8, multiPv: 6, movetimeMs: 3000 }),
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

  test('merges nothing when the requested multiPv exceeds the position\'s own legal-move count and main already covers it', async () => {
    const allMoveLines = Array.from({ length: START_FEN_LEGAL_MOVE_COUNT }, (_, i) => line(`m${i}`, 0));
    const main = fakeMain(analysisWithLines(allMoveLines));
    const transport = fakeTransport(analysisWithLines([line('e4', 28)]));
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    const result = await backend.analyzePosition(START_FEN, { multiPv: START_FEN_LEGAL_MOVE_COUNT + 20 });

    expect(result.lines).toEqual(allMoveLines);
  });

  describe('analyzeGame — breadth for game review (docs/tactics-rework.md §7)', () => {
    // A sharp position: White's knight on c4 goes to d6 forking the king on
    // e8 and the rook on b7, so `isTacticalPosition` says yes.
    const SHARP_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
    // A dead-quiet king-and-pawn ending: nothing hangs, nothing forks.
    const QUIET_FEN = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';

    function evalAt(fen: string, ply: number, moveSans: string[]) {
      return { ply, fen, depth: 18, lines: moveSans.map((san, index) => line(san, 30 - index)) };
    }

    function fakeBatchMain(evals: ReturnType<typeof evalAt>[]): EngineBackend {
      return {
        analyzePosition: vi.fn(),
        analyzeGame: vi.fn().mockResolvedValue(evals)
      };
    }

    function liteAnalysisFor(fen: string, moveSans: string[]): PositionAnalysis {
      return { ...analysisWithLines(moveSans.map((san, index) => line(san, 20 - index))), fen };
    }

    test('widens a sharp position that came back short of lines', async () => {
      const main = fakeBatchMain([evalAt(SHARP_FEN, 1, ['Nd6+'])]);
      const transport = fakeTransport(liteAnalysisFor(SHARP_FEN, ['Nd6+', 'Ne5', 'Nb6']));
      const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

      const result = await backend.analyzeGame([SHARP_FEN], { multiPv: 5 });

      expect(transport.request).toHaveBeenCalledTimes(1);
      expect(result[0]?.lines.map((l) => l.moveSan)).toEqual(['Nd6+', 'Ne5', 'Nb6']);
    });

    test('widens a quiet position when it is short of lines', async () => {
      const main = fakeBatchMain([evalAt(QUIET_FEN, 1, ['Kd2'])]);
      const transport = fakeTransport(liteAnalysisFor(QUIET_FEN, ['Kd2', 'e4', 'Kf2']));
      const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

      const result = await backend.analyzeGame([QUIET_FEN], { multiPv: 5 });

      expect(transport.request).toHaveBeenCalledTimes(1);
      expect(result[0]?.lines.map((l) => l.moveSan)).toEqual(['Kd2', 'e4', 'Kf2']);
    });

    test('caps how much of one game the browser tab is asked for', async () => {
      const evals = Array.from({ length: 40 }, (unused, ply) => evalAt(SHARP_FEN, ply + 1, ['Nd6+']));
      const main = fakeBatchMain(evals);
      const transport = fakeTransport(liteAnalysisFor(SHARP_FEN, ['Nd6+', 'Ne5']));
      const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

      await backend.analyzeGame(evals.map((e) => e.fen), { multiPv: 5 });

      expect(transport.request).toHaveBeenCalledTimes(24);
    });

    test('shares one budget with the single-position calls the same job makes', async () => {
      // A review job also probes single positions (the gated
      // tactic-prevention fallback), and those go through the same tunnel.
      // Counting only the batch would leave the documented ceiling to be
      // overrun one probe at a time.
      const evals = Array.from({ length: 40 }, (unused, ply) => evalAt(SHARP_FEN, ply + 1, ['Nd6+']));
      const main: EngineBackend = {
        analyzePosition: vi.fn().mockResolvedValue({ ...analysisWithLines([line('Nd6+', 30)]), fen: SHARP_FEN }),
        analyzeGame: vi.fn().mockResolvedValue(evals)
      };
      const transport = fakeTransport(liteAnalysisFor(SHARP_FEN, ['Nd6+', 'Ne5']));
      const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

      await backend.analyzeGame(evals.map((e) => e.fen), { multiPv: 5 });
      await backend.analyzePosition(SHARP_FEN, { multiPv: 5 });

      // analyzeGame runs first and so has first call on the budget, which is
      // the right order — the plies the whole report is built from matter
      // more than a fallback probe.
      expect(transport.request).toHaveBeenCalledTimes(24);
    });

    test('leaves the whole game exactly as main returned it when no tunnel answers', async () => {
      const main = fakeBatchMain([evalAt(SHARP_FEN, 1, ['Nd6+'])]);
      const transport: EngineTunnelTransport = { request: vi.fn().mockRejectedValue(new Error('no tunnel')) };
      const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

      const result = await backend.analyzeGame([SHARP_FEN], { multiPv: 5 });

      expect(result[0]?.lines.map((l) => l.moveSan)).toEqual(['Nd6+']);
    });
  });
});

describe('LiteSupplementedEngineBackend Thinking-log steps', () => {
  function tracedDebug() {
    const trace = createBotMoveTrace({ now: Date.now, source: 'turn', ply: 2 });
    return { trace, debug: newBotMoveDebugCollector(trace) };
  }

  test('records the main engine call as a step named after where it runs', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30), line('d4', 25)]));
    const backend = new LiteSupplementedEngineBackend(main, fakeTransport(null), 'user-1', { timeoutMs: 8000, mainBucket: 'external' });
    const { trace, debug } = tracedDebug();

    await backend.analyzePosition(START_FEN, { multiPv: 2, debug });

    const steps = trace.snapshot().steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ label: 'Main engine call (chess-api.com)', status: 'done', detail: '2 lines returned' });
  });

  test('adds a light-supplement step, with what it returned, only when main fell short', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30)]));
    const transport = fakeTransport(analysisWithLines([line('e4', 28), line('d4', 20)]));
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });
    const { trace, debug } = tracedDebug();

    await backend.analyzePosition(START_FEN, { multiPv: 5, debug });

    expect(trace.snapshot().steps.map((step) => [step.label, step.status])).toEqual([
      ['Main engine call (server Stockfish)', 'done'],
      ['Light browser engine supplement', 'done']
    ]);
    expect(trace.snapshot().steps[1]?.detail).toContain('2 lines returned');
  });

  test('marks the supplement failed, with the reason, when the tunnel is not there', async () => {
    const main = fakeMain(analysisWithLines([line('e4', 30)]));
    const transport: EngineTunnelTransport = { request: vi.fn().mockRejectedValue(new Error('no browser tab connected')) };
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });
    const { trace, debug } = tracedDebug();

    const result = await backend.analyzePosition(START_FEN, { multiPv: 5, debug });

    expect(result.lines.map((l) => l.moveSan)).toEqual(['e4']);
    expect(trace.snapshot().steps[1]).toMatchObject({ status: 'failed', detail: 'no browser tab connected' });
  });

  test('a main engine that throws leaves its step failed and still rethrows', async () => {
    const main: EngineBackend = { analyzePosition: vi.fn().mockRejectedValue(new Error('engine down')), analyzeGame: vi.fn() };
    const backend = new LiteSupplementedEngineBackend(main, fakeTransport(null), 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });
    const { trace, debug } = tracedDebug();

    await expect(backend.analyzePosition(START_FEN, { multiPv: 2, debug })).rejects.toThrow('engine down');
    expect(trace.snapshot().steps[0]).toMatchObject({ status: 'failed', detail: 'engine down' });
  });
});
