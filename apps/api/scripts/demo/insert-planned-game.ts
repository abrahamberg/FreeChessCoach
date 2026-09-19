import { classifyTimeControl, type PgnMoveComment, type StatsEntry } from '@freechesscoach/chess-analysis';
import type { GameReport } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../../src/db/repositories/analyses.js';
import * as gamesRepo from '../../src/db/repositories/games.js';
import type { Database } from '../../src/db/schema.js';
import { annotatedPgnForReport } from '../../src/services/game-report.js';
import type { PlannedGame } from './game-plan.js';
import { buildDemoReport } from './report-builder.js';
import { clamp, gaussian, mulberry32, type Rng } from './rng.js';

const MS_PER_MINUTE = 60 * 1000;

/** The opening line as a PGN with real headers. The game itself stops after the
 * opening: the demo needs the *shape* of a year of games (names, dates, results,
 * ratings, openings), not 3,420 fully played ones. */
export function pgnForPlannedGame(game: PlannedGame, userName: string): string {
  const [white, black] = game.userColor === 'white' ? [userName, game.opponentName] : [game.opponentName, userName];
  const [whiteElo, blackElo] = game.userColor === 'white' ? [game.platformRating, game.opponentRating] : [game.opponentRating, game.platformRating];
  const iso = game.playedAt.toISOString();
  const headers = [
    ['Event', 'Rated Rapid game'],
    ['Site', 'https://lichess.org/'],
    ['Date', iso.slice(0, 10).replaceAll('-', '.')],
    ['UTCTime', iso.slice(11, 19)],
    ['White', white],
    ['Black', black],
    ['Result', game.pgnResult],
    ['WhiteElo', String(whiteElo)],
    ['BlackElo', String(blackElo)],
    ['TimeControl', game.timeControl],
    ...(game.opening.eco ? [['ECO', game.opening.eco]] : []),
    ...(game.opening.name ? [['Opening', game.opening.name]] : []),
    ['Termination', 'Normal']
  ]
    .map(([key, value]) => `[${key} "${value}"]`)
    .join('\n');
  const movetext = game.opening.plies.map((ply, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${ply}` : ply)).join(' ');
  return `${headers}\n\n${movetext} ${game.pgnResult}\n`;
}

export function reportForPlannedGame(game: PlannedGame, seed: number): GameReport {
  return buildDemoReport(mulberry32(seed), {
    estimatedRating: game.estimatedRating,
    opponentRating: game.opponentRating,
    userColor: game.userColor,
    result: game.result,
    opening: game.opening,
    reachedEndgame: game.reachedEndgame
  }).report;
}

/** Used for games that only ever reach the stats archive (never a `games` row). */
export function statsEntryFor(game: PlannedGame, report: GameReport): StatsEntry {
  return { gameReport: report, result: game.result, userColor: game.userColor, playedAt: game.playedAt, speed: classifyTimeControl(game.timeControl) };
}

/** A fully imported, analyzed game as if the user had imported it from Lichess. */
export async function insertAnalyzedGame(db: Kysely<Database>, userId: string, userName: string, game: PlannedGame, seed: number): Promise<string> {
  const pgn = pgnForPlannedGame(game, userName);
  const report = reportForPlannedGame(game, seed);
  const [white, black] = game.userColor === 'white' ? [userName, game.opponentName] : [game.opponentName, userName];
  const row = await gamesRepo.insert(db, {
    userId,
    pgn,
    source: 'lichess',
    userColor: game.userColor,
    whiteName: white,
    blackName: black,
    result: game.pgnResult,
    timeControl: game.timeControl,
    eco: game.opening.eco,
    playedAt: game.playedAt,
    whiteElo: game.userColor === 'white' ? game.platformRating : game.opponentRating,
    blackElo: game.userColor === 'white' ? game.opponentRating : game.platformRating,
    rated: true,
    termination: 'Normal',
    variant: 'standard',
    speed: classifyTimeControl(game.timeControl),
    moveTimes: clockTimesForOpening(mulberry32(seed + 1), game.opening.plies.length, game.timeControl)
  });
  const analysis = await analysesRepo.insertQueued(db, row.id);
  await analysesRepo.storeGameReport(db, analysis.id, report);
  await analysesRepo.updateStatus(db, analysis.id, 'ready');
  await gamesRepo.updateAnnotatedPgn(db, row.id, annotatedPgnForReport(pgn, report));
  return row.id;
}

/** A clock reading and thinking time for each ply, as a Lichess export's `[%clk]` tags
 * would give: each side counts down from the time control, spending a few seconds a
 * move in the opening. Without these, the diagnostics correctly report "no reliable
 * clock data" on every finding. */
export function clockTimesForOpening(rng: Rng, plyCount: number, timeControl: string): PgnMoveComment[] {
  const [baseSeconds, incrementSeconds] = timeControl.split('+').map(Number) as [number, number];
  const clocks = { white: baseSeconds * 1000, black: baseSeconds * 1000 };
  const previous: Record<'white' | 'black', number | null> = { white: null, black: null };
  return Array.from({ length: plyCount }, (_, index): PgnMoveComment => {
    const ply = index + 1;
    const side = ply % 2 === 1 ? 'white' : 'black';
    const spent = Math.round(clamp(gaussian(rng, 5, 3), 1, 20) * 1000);
    clocks[side] = Math.max(0, clocks[side] - spent + incrementSeconds * 1000);
    const before = previous[side];
    previous[side] = clocks[side];
    return { ply, clockMs: clocks[side], evalCp: null, timeSpentMs: before === null ? null : before - clocks[side] + incrementSeconds * 1000 };
  });
}

/** How long after a game the "lesson" on it started. */
export function lessonStart(game: PlannedGame): Date {
  return new Date(game.playedAt.getTime() + 35 * MS_PER_MINUTE);
}
