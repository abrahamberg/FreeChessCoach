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

  describe('gateLiveSupplementBySharpness (bot-move path only)', () => {
    // Same sharp/quiet fixtures as the analyzeGame suite below.
    const SHARP_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
    const QUIET_FEN = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';

    test('skips the lite tunnel on a quiet position that fell short of lines', async () => {
      const main = fakeMain({ ...analysisWithLines([line('Kd2', 0)]), fen: QUIET_FEN });
      const transport = fakeTransport(analysisWithLines([line('Kd2', 0), line('e4', -5)]));
      const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', {
        timeoutMs: 8000,
        mainBucket: 'internal',
        gateLiveSupplementBySharpness: true
      });

      const result = await backend.analyzePosition(QUIET_FEN, { multiPv: 5 });

      expect(transport.request).not.toHaveBeenCalled();
      expect(result.lines.map((l) => l.moveSan)).toEqual(['Kd2']);
    });

    test('still calls the lite tunnel on a sharp position that fell short of lines', async () => {
      const main = fakeMain({ ...analysisWithLines([line('Nd6+', 300)]), fen: SHARP_FEN });
      const transport = fakeTransport(analysisWithLines([line('Nd6+', 300), line('Ne5', 10)]));
      const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', {
        timeoutMs: 8000,
        mainBucket: 'internal',
        gateLiveSupplementBySharpness: true
      });

      const result = await backend.analyzePosition(SHARP_FEN, { multiPv: 5 });

      expect(transport.request).toHaveBeenCalledTimes(1);
      expect(result.lines.map((l) => l.moveSan)).toEqual(['Nd6+', 'Ne5']);
    });

    test('still calls the lite tunnel on a quiet position when the gate is left off (review path)', async () => {
      const main = fakeMain({ ...analysisWithLines([line('Kd2', 0)]), fen: QUIET_FEN });
      const transport = fakeTransport(analysisWithLines([line('Kd2', 0), line('e4', -5)]));
      const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

      await backend.analyzePosition(QUIET_FEN, { multiPv: 5 });

      expect(transport.request).toHaveBeenCalledTimes(1);
    });
  });

  test('does not attempt a lite request when the requested multiPv exceeds the position\'s own legal-move count and main already covers it', async () => {
    const allMoveLines = Array.from({ length: START_FEN_LEGAL_MOVE_COUNT }, (_, i) => line(`m${i}`, 0));
    const main = fakeMain(analysisWithLines(allMoveLines));
    const transport = fakeTransport(null);
    const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

    await backend.analyzePosition(START_FEN, { multiPv: START_FEN_LEGAL_MOVE_COUNT + 20 });

    expect(transport.request).not.toHaveBeenCalled();
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

    test('spends nothing on a quiet position, however short of lines it is', async () => {
      // §7: breadth is budgeted by ply. A quiet position with one line is
      // not short of anything worth having, and there are far more of them
      // in a game than there are sharp ones.
      const main = fakeBatchMain([evalAt(QUIET_FEN, 1, ['Kd2'])]);
      const transport = fakeTransport(liteAnalysisFor(QUIET_FEN, ['Kd2', 'e4', 'Kf2']));
      const backend = new LiteSupplementedEngineBackend(main, transport, 'user-1', { timeoutMs: 8000, mainBucket: 'internal' });

      const result = await backend.analyzeGame([QUIET_FEN], { multiPv: 5 });

      expect(transport.request).not.toHaveBeenCalled();
      expect(result[0]?.lines.map((l) => l.moveSan)).toEqual(['Kd2']);
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