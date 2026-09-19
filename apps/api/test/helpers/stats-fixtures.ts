import type { Kysely } from 'kysely';
import { TACTIC_MOTIF_TYPES, type GameReport, type PlayerReport } from '@freechesscoach/shared';
import * as analysesRepo from '../../src/db/repositories/analyses.js';
import * as gamesRepo from '../../src/db/repositories/games.js';
import type { Database } from '../../src/db/schema.js';

function playerReport(accuracy: number): PlayerReport {
  const counts = Object.fromEntries(
    ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'].map(
      (quality) => [quality, 0]
    )
  ) as PlayerReport['counts'];
  const tacticMotifs = Object.fromEntries(
    TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])
  ) as PlayerReport['tacticMotifs'];
  return {
    accuracy,
    phaseAccuracy: { opening: 90, middlegame: 75, endgame: null },
    phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: 'none' },
    scores: { opening: 85, tactics: 70, strategy: 78, endgame: null },
    strategySubScores: { pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: { standing: null, theme: null },
    counts,
    acpl: 20,
    estimatedRating: { value: 1500, range: [1400, 1600], confidence: 'medium' },
    tacticMotifs
  };
}

/** A valid stored report; `accuracy` and per-motif `fork` counts vary so two
 * games produce visibly different dashboards. */
export function gameReportFixture(options: { accuracy?: number; fork?: { opportunities: number; found: number } } = {}): GameReport {
  const white = playerReport(options.accuracy ?? 80);
  if (options.fork) white.tacticMotifs.fork = options.fork;
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
    players: { white, black: playerReport(70) },
    moves: []
  };
}

export interface ReadyGameOptions {
  source?: 'paste' | 'upload' | 'lichess' | 'chesscom';
  timeControl?: string | null;
  playedAt?: Date | null;
  result?: string;
  report?: GameReport;
}

/** An imported game with a `ready` analysis holding a valid report. */
export async function makeReadyGame(db: Kysely<Database>, userId: string, options: ReadyGameOptions = {}) {
  const game = await gamesRepo.insert(db, {
    userId,
    pgn: `1. e4 e5 ${crypto.randomUUID()}`,
    source: options.source ?? 'lichess',
    userColor: 'white',
    whiteName: 'Ann',
    blackName: 'Bob',
    result: options.result ?? '1-0',
    timeControl: options.timeControl === undefined ? '600+0' : options.timeControl,
    eco: 'C50',
    playedAt: options.playedAt === undefined ? new Date('2026-03-04T10:00:00Z') : options.playedAt
  });
  const analysis = await analysesRepo.insertQueued(db, game.id);
  await analysesRepo.storeGameReport(db, analysis.id, options.report ?? gameReportFixture());
  await analysesRepo.updateStatus(db, analysis.id, 'ready');
  return game;
}
