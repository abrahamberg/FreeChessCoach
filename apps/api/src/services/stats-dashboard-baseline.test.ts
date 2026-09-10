import { TACTIC_MOTIF_TYPES, type GameReport, type PlayerReport, type TacticMotifCounts } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import type { Database } from '../db/schema.js';
import { getGameTacticBaselineNote } from './stats-dashboard.js';

function motifs(fork: { opportunities: number; found: number }): TacticMotifCounts {
  const base = Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }]));
  return { ...base, fork } as TacticMotifCounts;
}

/** A schema-valid report — only `tacticMotifs` matters here, but the whole
 * thing has to parse or the row is skipped as unreadable. */
function reportWith(fork: { opportunities: number; found: number }): GameReport {
  const player: PlayerReport = {
    accuracy: 80,
    phaseAccuracy: { opening: 90, middlegame: 75, endgame: null },
    phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: 'none' },
    scores: { opening: 85, tactics: 70, strategy: 78, endgame: null },
    strategySubScores: { pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: { standing: null, theme: null },
    counts: Object.fromEntries(
      ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'].map(
        (quality) => [quality, 0]
      )
    ) as PlayerReport['counts'],
    acpl: 20,
    estimatedRating: { value: 1500, range: [1400, 1600], confidence: 'medium' },
    tacticMotifs: motifs(fork)
  };

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
        white: { lastBookPly: 6, leftBookPly: 7, leftBookMove: 'Bc4', bookAlternatives: [] },
        black: { lastBookPly: 6, leftBookPly: 8, leftBookMove: 'Nf6', bookAlternatives: [] }
      }
    },
    phases: { openingEndPly: 12, endgameStartPly: null, openingSource: 'book' },
    players: { white: player, black: player },
    moves: []
  };
}

function row(gameId: string, fork: { opportunities: number; found: number }) {
  return {
    gameId,
    gameReport: reportWith(fork),
    pgnResult: '1-0',
    userColor: 'white' as const,
    playedAt: null,
    timeControl: null
  };
}

describe('getGameTacticBaselineNote', () => {
  const db = {} as Kysely<Database>;

  test('measures the game against the player\'s other games, with this one excluded', async () => {
    // Nine earlier games at nine forks found from ten, and this game at none
    // of two. Leaving this game in the aggregate would let it soften its own
    // baseline.
    const others = Array.from({ length: 9 }, (unused, index) => row(`other-${index}`, { opportunities: 1, found: 1 }));
    others[0] = row('other-0', { opportunities: 2, found: 1 });
    vi.spyOn(analysesRepo, 'listReadyReportsForUser').mockResolvedValue([...others, row('this-game', { opportunities: 2, found: 0 })]);

    const note = await getGameTacticBaselineNote(db, 'user-1', 'this-game', reportWith({ opportunities: 2, found: 0 }), 'white');

    expect(note).toMatchObject({ motif: 'fork', kind: 'missed', tone: 'unusual', gameChances: 2, baselineGames: 9 });
    expect(note?.baselineRate).toBeCloseTo(0.1);
  });

  test('says nothing when there is not enough history to compare against', async () => {
    vi.spyOn(analysesRepo, 'listReadyReportsForUser').mockResolvedValue([row('other-0', { opportunities: 2, found: 2 })]);

    expect(await getGameTacticBaselineNote(db, 'user-1', 'this-game', reportWith({ opportunities: 2, found: 0 }), 'white')).toBeNull();
  });

  test('says nothing for a report that no longer parses, rather than throwing', async () => {
    vi.spyOn(analysesRepo, 'listReadyReportsForUser').mockResolvedValue([]);

    expect(await getGameTacticBaselineNote(db, 'user-1', 'this-game', { players: null }, 'white')).toBeNull();
  });
});
