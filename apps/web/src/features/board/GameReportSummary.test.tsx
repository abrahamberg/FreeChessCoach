import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { GameReport, PlayerReport } from '@chess-coach/shared';
import { GameReportSummary } from './GameReportSummary.js';

function buildPlayerReport(overrides: Partial<PlayerReport> = {}): PlayerReport {
  return {
    accuracy: 87.4,
    phaseAccuracy: { opening: 92.1, middlegame: 80.5, endgame: null },
    phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: 'none' },
    scores: { opening: 90, tactics: 75, strategy: 82, endgame: null },
    counts: {
      brilliant: 0,
      great: 1,
      best: 10,
      excellent: 3,
      good: 5,
      book: 6,
      inaccuracy: 2,
      mistake: 1,
      miss: 0,
      blunder: 0,
      forced: 2
    },
    acpl: 24.6,
    estimatedRating: { value: 1550, range: [1400, 1700], confidence: 'medium' },
    ...overrides
  };
}

function buildReport(overrides: { white?: Partial<PlayerReport>; black?: Partial<PlayerReport> } = {}): GameReport {
  return {
    engine: { name: 'stockfish', depth: 16, multiPv: 3 },
    book: {
      source: 'test-fixture@1',
      eco: 'C50',
      ecoVolume: 'C',
      name: 'Italian Game',
      family: 'Italian Game',
      variation: null,
      namedAtPly: 4,
      lastBookPly: 6,
      players: {
        white: { lastBookPly: 6, leftBookPly: null, leftBookMove: null, bookAlternatives: [] },
        black: { lastBookPly: 6, leftBookPly: null, leftBookMove: null, bookAlternatives: [] }
      }
    },
    phases: { openingEndPly: 10, endgameStartPly: null, openingSource: 'book' },
    players: {
      white: buildPlayerReport(overrides.white),
      black: buildPlayerReport(overrides.black)
    },
    moves: []
  };
}

describe('GameReportSummary', () => {
  test('renders both colours\' accuracy headline', () => {
    render(<GameReportSummary report={buildReport({ black: { accuracy: 65.2 } })} />);
    expect(screen.getByText('87.4%')).toBeInTheDocument();
    expect(screen.getByText('65.2%')).toBeInTheDocument();
  });

  test('renders a dash for a null phase accuracy or score', () => {
    render(<GameReportSummary report={buildReport()} />);
    // Both colours' endgame phase accuracy and endgame score are null in the fixture.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  test('renders the estimated rating as a range, never a bare point estimate', () => {
    render(<GameReportSummary report={buildReport()} />);
    expect(screen.getAllByText('1550 (1400–1700)').length).toBe(2);
  });

  test('falls back to the reason when a rating estimate is unavailable', () => {
    render(
      <GameReportSummary
        report={buildReport({
          white: { estimatedRating: { value: null, range: null, confidence: 'low', reason: 'insufficient moves' } }
        })}
      />
    );
    expect(screen.getByText('insufficient moves')).toBeInTheDocument();
  });

  test('renders classification counts for both colours, including inaccuracies/mistakes/blunders', () => {
    render(<GameReportSummary report={buildReport()} />);
    expect(screen.getAllByText('Inaccuracies').length).toBe(2);
    expect(screen.getAllByText('Mistakes').length).toBe(2);
    expect(screen.getAllByText('Blunders').length).toBe(2);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });
});
