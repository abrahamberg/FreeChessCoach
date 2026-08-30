import type { PositionAnalysis } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import { buildInvestigatorTools, type InvestigatorToolsDependencies } from './investigator-tools.js';

const TOOL_OPTIONS = { toolCallId: '1', messages: [], context: undefined } as never;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function positionAnalysisFixture(fen: string): PositionAnalysis {
  return {
    fen,
    depth: 18,
    multiPv: 1,
    bestMove: 'e4',
    eval: { cp: 20, mateIn: null },
    lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4', 'e5'], cp: 20, mateIn: null }],
    features: {
      turn: 'white',
      boardState: 'none',
      availableMoves: ['e4', 'd4'],
      mobility: { white: 20, black: 20 },
      controlledSquares: [],
      piecesUnderAttack: [],
      hangingPieces: [],
      underDefendedPieces: [],
      overloadedDefenders: [],
      centerControlScore: { white: 0, black: 0 },
      openFiles: [],
      semiOpenFiles: [],
      doubledPawns: [],
      isolatedPawns: [],
      passedPawns: [],
      targetsAttacked: [],
      forks: [],
      captureOpportunities: []
    }
  };
}

function makeDeps(overrides: Partial<InvestigatorToolsDependencies> = {}): InvestigatorToolsDependencies {
  return {
    analyzePosition: vi.fn().mockResolvedValue(positionAnalysisFixture(START_FEN)),
    ...overrides
  };
}

describe('buildInvestigatorTools', () => {
  describe('apply_moves', () => {
    test('returns every intermediate fen for a legal SAN sequence', async () => {
      const tools = buildInvestigatorTools(makeDeps());

      const result = await tools.apply_moves?.execute?.({ fen: START_FEN, moves: ['e4', 'e5'] }, TOOL_OPTIONS);

      expect(result).toEqual([
        { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', moveSan: 'e4' },
        { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', moveSan: 'e5' }
      ]);
    });

    test('an illegal move returns an error instead of a guessed position', async () => {
      const tools = buildInvestigatorTools(makeDeps());

      const result = await tools.apply_moves?.execute?.({ fen: START_FEN, moves: ['Nowhere'] }, TOOL_OPTIONS);

      expect(result).toEqual({ error: 'Illegal move: Nowhere' });
    });

    test('a 5th call in one investigation returns budget_exhausted', async () => {
      const tools = buildInvestigatorTools(makeDeps());
      const call = (move: string) => tools.apply_moves?.execute?.({ fen: START_FEN, moves: [move] }, TOOL_OPTIONS);

      await call('e4');
      await call('d4');
      await call('c4');
      await call('Nf3');
      const fifth = await call('g3');

      expect(fifth).toEqual({ error: 'budget_exhausted — answer with what you have' });
    });
  });

  describe('list_candidate_moves', () => {
    test('delegates to annotateCandidateMoves without any engine call', async () => {
      const deps = makeDeps();
      const tools = buildInvestigatorTools(deps);

      const result = await tools.list_candidate_moves?.execute?.({ fen: START_FEN, moves: ['e4', 'd4'] }, TOOL_OPTIONS);

      expect(result).toEqual([
        { moveSan: 'e4', createsFork: false, createsHangingPiece: false, createsUnderDefendedPiece: false, mobilityDelta: expect.any(Number), motif: null },
        { moveSan: 'd4', createsFork: false, createsHangingPiece: false, createsUnderDefendedPiece: false, mobilityDelta: expect.any(Number), motif: null }
      ]);
      expect(deps.analyzePosition).not.toHaveBeenCalled();
    });
  });

  describe('analyze_fen', () => {
    test('returns a curated digest, not raw PositionAnalysis JSON', async () => {
      const deps = makeDeps();
      const tools = buildInvestigatorTools(deps);

      const result = await tools.analyze_fen?.execute?.({ fen: START_FEN }, TOOL_OPTIONS);

      expect(typeof result).toBe('string');
      expect(result).toContain('Best move: e4 (eval +0.20)');
      expect(result).not.toContain('"features"');
      expect(deps.analyzePosition).toHaveBeenCalledWith(START_FEN);
    });

    test('a 4th call in one investigation returns budget_exhausted after 3', async () => {
      const tools = buildInvestigatorTools(makeDeps());
      const call = (fen: string) => tools.analyze_fen?.execute?.({ fen }, TOOL_OPTIONS);

      await call(`${START_FEN} 1`);
      await call(`${START_FEN} 2`);
      await call(`${START_FEN} 3`);
      const fourth = await call(`${START_FEN} 4`);

      expect(fourth).toEqual({ error: 'budget_exhausted — answer with what you have' });
    });

    test('identical repeated call returns the cached result without a second engine invocation', async () => {
      const deps = makeDeps();
      const tools = buildInvestigatorTools(deps);
      const args = { fen: START_FEN };

      const first = await tools.analyze_fen?.execute?.(args, TOOL_OPTIONS);
      const second = await tools.analyze_fen?.execute?.(args, TOOL_OPTIONS);

      expect(second).toEqual(first);
      expect(deps.analyzePosition).toHaveBeenCalledTimes(1);
    });
  });

  describe('scan_tactics', () => {
    const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
    const FLIPPED_FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 b - - 0 1';
    const MOVER_IN_CHECK_FEN = 'rnb1k1nr/pppp1ppp/8/2b5/4P3/8/PPPP1qPP/RNBQKBNR w KQkq - 0 3';

    test('returns available and allowed tactics, each ranked by engine line', async () => {
      const analyzePosition = vi.fn().mockImplementation((fen: string) => {
        if (fen === FORK_FEN) {
          return Promise.resolve({
            ...positionAnalysisFixture(fen),
            lines: [
              { moveUci: 'a1b2', moveSan: 'Kb2', pvSan: ['Kb2'], cp: 400, mateIn: null },
              { moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 500, mateIn: null }
            ]
          });
        }
        return Promise.resolve({
          ...positionAnalysisFixture(fen),
          lines: [{ moveUci: 'e8d8', moveSan: 'Kd8', pvSan: ['Kd8'], cp: -400, mateIn: null }]
        });
      });
      const tools = buildInvestigatorTools(makeDeps({ analyzePosition }));

      const result = await tools.scan_tactics?.execute?.({ fen: FORK_FEN }, TOOL_OPTIONS);

      expect(result).toEqual({ available: [{ moveSan: 'Nd6+', motif: 'fork', rank: 1 }], allowed: [] });
      expect(analyzePosition).toHaveBeenCalledWith(FORK_FEN);
      expect(analyzePosition).toHaveBeenCalledWith(FLIPPED_FORK_FEN);
    });

    test('topN excludes a motif line beyond it, and includes it once topN reaches its rank', async () => {
      const analyzePosition = vi.fn().mockImplementation((fen: string) => {
        if (fen === FORK_FEN) {
          return Promise.resolve({
            ...positionAnalysisFixture(fen),
            lines: [
              { moveUci: 'a1b2', moveSan: 'Kb2', pvSan: ['Kb2'], cp: 400, mateIn: null },
              { moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 500, mateIn: null }
            ]
          });
        }
        return Promise.resolve({ ...positionAnalysisFixture(fen), lines: [] });
      });
      const tools = buildInvestigatorTools(makeDeps({ analyzePosition }));

      const withoutRank1 = await tools.scan_tactics?.execute?.({ fen: FORK_FEN, topN: 1 }, TOOL_OPTIONS);
      const withRank1 = await tools.scan_tactics?.execute?.({ fen: FORK_FEN, topN: 2 }, TOOL_OPTIONS);

      expect(withoutRank1).toMatchObject({ available: [] });
      expect(withRank1).toMatchObject({ available: [{ moveSan: 'Nd6+', motif: 'fork', rank: 1 }] });
    });

    test('returns allowed: null cleanly, without throwing, when the side to move is in check', async () => {
      const deps = makeDeps({ analyzePosition: vi.fn().mockResolvedValue(positionAnalysisFixture(MOVER_IN_CHECK_FEN)) });
      const tools = buildInvestigatorTools(deps);

      const result = await tools.scan_tactics?.execute?.({ fen: MOVER_IN_CHECK_FEN }, TOOL_OPTIONS);

      expect(result).toEqual({ available: [], allowed: null });
      expect(deps.analyzePosition).toHaveBeenCalledTimes(1);
    });
  });
});
