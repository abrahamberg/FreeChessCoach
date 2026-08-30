import { describe, expect, test } from 'vitest';
import { MOVE_QUALITIES } from './analysis.js';
import {
  ClassificationCountsSchema,
  GameReportSchema,
  TACTIC_MOTIF_TYPES,
  TacticMotifCountsSchema,
  type ClassificationCounts,
  type GameReport,
  type TacticMotifCounts
} from './game-report.js';

function zeroCounts(): ClassificationCounts {
  const entries = MOVE_QUALITIES.map((quality) => [quality, 0] as const);
  return Object.fromEntries(entries) as ClassificationCounts;
}

function zeroTacticMotifCounts(): TacticMotifCounts {
  const entries = TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }] as const);
  return Object.fromEntries(entries) as TacticMotifCounts;
}

describe('ClassificationCountsSchema', () => {
  test('has exactly one field per MoveQuality — §5.9', () => {
    expect(Object.keys(ClassificationCountsSchema.shape).sort()).toEqual([...MOVE_QUALITIES].sort());
  });

  test('accepts an all-zero count object', () => {
    expect(ClassificationCountsSchema.safeParse(zeroCounts()).success).toBe(true);
  });

  test('rejects a negative count', () => {
    const invalid = { ...zeroCounts(), blunder: -1 };
    expect(ClassificationCountsSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('TacticMotifCountsSchema', () => {
  test('has exactly one field per TacticMotifType', () => {
    expect(Object.keys(TacticMotifCountsSchema.shape).sort()).toEqual([...TACTIC_MOTIF_TYPES].sort());
  });

  test('accepts an all-zero count object', () => {
    expect(TacticMotifCountsSchema.safeParse(zeroTacticMotifCounts()).success).toBe(true);
  });

  test('rejects a negative count', () => {
    const invalid = { ...zeroTacticMotifCounts(), fork: { opportunities: -1, found: 0 } };
    expect(TacticMotifCountsSchema.safeParse(invalid).success).toBe(false);
  });

  test('accepts a pre-existing stored report lacking preventable/prevented — no migration for jsonb rows', () => {
    // zeroTacticMotifCounts() deliberately never sets preventable/prevented,
    // simulating a GameReport stored before those fields existed.
    const result = TacticMotifCountsSchema.safeParse(zeroTacticMotifCounts());
    expect(result.success).toBe(true);
    expect(result.success && result.data.fork.preventable).toBeUndefined();
    expect(result.success && result.data.fork.prevented).toBeUndefined();
  });

  test('accepts preventable/prevented when present', () => {
    const withNewFields = { ...zeroTacticMotifCounts(), fork: { opportunities: 3, found: 2, preventable: 2, prevented: 1 } };
    const result = TacticMotifCountsSchema.safeParse(withNewFields);
    expect(result.success).toBe(true);
    expect(result.success && result.data.fork.preventable).toBe(2);
    expect(result.success && result.data.fork.prevented).toBe(1);
  });
});

describe('GameReportSchema', () => {
  function buildPlayerReport() {
    return {
      accuracy: 87.4,
      phaseAccuracy: { opening: 92.1, middlegame: 80.5, endgame: null },
      phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: 'none' },
      scores: { opening: 90, tactics: 75, strategy: 82, endgame: null },
      strategySubScores: { pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
      endgame: { standing: null, theme: null },
      counts: { ...zeroCounts(), best: 10, good: 15, inaccuracy: 2 },
      acpl: 24.6,
      estimatedRating: { value: 1550, range: [1400, 1700], confidence: 'medium' },
      tacticMotifs: zeroTacticMotifCounts()
    };
  }

  function buildFixture(): GameReport {
    return {
      engine: { name: 'stockfish', depth: 18, multiPv: 3 },
      book: {
        source: 'lichess-chess-openings@2024.01',
        eco: 'C50',
        ecoVolume: 'C',
        name: 'Italian Game',
        family: 'Italian Game',
        variation: null,
        namedAtPly: 4,
        lastBookPly: 6,
        players: {
          white: { lastBookPly: 6, leftBookPly: 7, leftBookMove: 'Bc4', bookAlternatives: ['Nf3', 'Bb5'] },
          black: { lastBookPly: 6, leftBookPly: 8, leftBookMove: 'Nf6', bookAlternatives: ['Nc6'] }
        }
      },
      phases: { openingEndPly: 12, endgameStartPly: null, openingSource: 'book' },
      players: { white: buildPlayerReport(), black: buildPlayerReport() },
      moves: []
    } as unknown as GameReport;
  }

  test('parses a fully-populated fixture report', () => {
    const result = GameReportSchema.safeParse(buildFixture());
    expect(result.success).toBe(true);
  });

  test('rejects an out-of-range accuracy', () => {
    const fixture = buildFixture();
    fixture.players.white.accuracy = 150;
    expect(GameReportSchema.safeParse(fixture).success).toBe(false);
  });

  test('allows a null estimatedRating value with a reason, per §8.6 insufficient-moves case', () => {
    const fixture = buildFixture();
    fixture.players.white.estimatedRating = { value: null, range: null, confidence: 'low', reason: 'insufficient moves' };
    expect(GameReportSchema.safeParse(fixture).success).toBe(true);
  });
});
