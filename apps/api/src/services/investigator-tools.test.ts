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
        { moveSan: 'e4', createsFork: false, createsHangingPiece: false, createsUnderDefendedPiece: false, mobilityDelta: expect.any(Number) },
        { moveSan: 'd4', createsFork: false, createsHangingPiece: false, createsUnderDefendedPiece: false, mobilityDelta: expect.any(Number) }
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
});
