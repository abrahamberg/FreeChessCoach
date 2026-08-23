import { describe, expect, test } from 'vitest';
import type { PositionAnalysis, PositionAnalysisLine, PositionFeatures } from '@freechesscoach/shared';
import { renderEngineAnalysisSummary } from './position-analysis-summary.js';

function line(overrides: Partial<PositionAnalysisLine> & Pick<PositionAnalysisLine, 'moveSan' | 'pvSan'>): PositionAnalysisLine {
  return { moveUci: '', cp: 0, mateIn: null, ...overrides };
}

function features(overrides: Partial<PositionFeatures> = {}): PositionFeatures {
  return {
    turn: 'white',
    boardState: 'none',
    availableMoves: [],
    mobility: { white: 20, black: 20 },
    controlledSquares: [],
    piecesUnderAttack: [],
    hangingPieces: [],
    underDefendedPieces: [],
    overloadedDefenders: [],
    centerControlScore: { white: 2, black: 2 },
    openFiles: [],
    semiOpenFiles: [],
    doubledPawns: [],
    isolatedPawns: [],
    passedPawns: [],
    targetsAttacked: [],
    forks: [],
    captureOpportunities: [],
    ...overrides
  };
}

function analysis(overrides: Partial<PositionAnalysis> & Pick<PositionAnalysis, 'bestMove' | 'lines'>): PositionAnalysis {
  return {
    fen: 'fen',
    depth: 16,
    multiPv: overrides.lines.length,
    eval: { cp: overrides.lines[0]?.cp ?? null, mateIn: overrides.lines[0]?.mateIn ?? null },
    features: features(),
    ...overrides
  };
}

describe('renderEngineAnalysisSummary', () => {
  test('renders the best move, its line, and other options', () => {
    const text = renderEngineAnalysisSummary(
      analysis({
        bestMove: 'd6',
        lines: [
          line({ moveSan: 'd6', pvSan: ['d6', 'O-O'], cp: 17 }),
          line({ moveSan: 'Ba3', pvSan: ['Ba3', 'a6'], cp: 14 })
        ]
      })
    );

    expect(text).toContain('Best move: d6 (eval +0.17)');
    expect(text).toContain('Line: d6 O-O');
    expect(text).toContain('Other options:\n- Ba3 (eval +0.14): Ba3 a6');
  });

  test('reports checkmate/stalemate instead of a best move when there are no legal moves', () => {
    const mate = renderEngineAnalysisSummary(
      analysis({ bestMove: null, lines: [], features: features({ boardState: 'checkmate' }) })
    );
    expect(mate).toContain('Checkmate — no moves.');

    const stalemate = renderEngineAnalysisSummary(
      analysis({ bestMove: null, lines: [], features: features({ boardState: 'stalemate' }) })
    );
    expect(stalemate).toContain('Stalemate — no moves.');
  });

  test('surfaces hanging pieces, forks, and favorable captures as bullets, omitting the section when there are none', () => {
    const withFeatures = renderEngineAnalysisSummary(
      analysis({
        bestMove: 'd6',
        lines: [line({ moveSan: 'd6', pvSan: ['d6'], cp: 17 })],
        features: features({
          hangingPieces: [{ square: 'e5', piece: 'p', color: 'black', attackers: 1, defenders: 0 }],
          forks: [{ square: 'd5', piece: 'n', forkedSquares: ['c7', 'e7'] }],
          captureOpportunities: [
            { moveSan: 'Nxe5', from: 'f3', to: 'e5', capturedPiece: 'p', favorable: true },
            { moveSan: 'Bxf7', from: 'c4', to: 'f7', capturedPiece: 'p', favorable: false }
          ]
        })
      })
    );

    expect(withFeatures).toContain('Notable features:');
    expect(withFeatures).toContain('- black p on e5 is hanging');
    expect(withFeatures).toContain('- n on d5 forks c7/e7');
    expect(withFeatures).toContain('- Nxe5 wins material (captures the p on e5)');
    expect(withFeatures).not.toContain('Bxf7');

    const withoutFeatures = renderEngineAnalysisSummary(
      analysis({ bestMove: 'd6', lines: [line({ moveSan: 'd6', pvSan: ['d6'], cp: 17 })] })
    );
    expect(withoutFeatures).not.toContain('Notable features');
  });
});
