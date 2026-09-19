import type { PlayerColor } from '@freechesscoach/shared';
import { DEMO_OPENINGS, UNNAMED_OPENINGS, type DemoOpening } from './openings.js';
import type { DemoResult } from './report-builder.js';
import { estimatedRatingOnDay, trueRatingOnDay, YEAR_DAYS } from './rating-curve.js';
import { clamp, gaussian, pick, pickWeighted, type Rng } from './rng.js';
import { opponentName } from './usernames.js';

/** The import limit is 30/day (packages/shared/src/import-limits.ts): a plan
 * that exceeded it would show a player doing something the app forbids. */
const MAX_GAMES_PER_DAY = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const PLATFORM_RATING_LAG = 40;
const COLOUR_FLIP_CHANCE = 0.06;

export interface PlannedGame {
  /** 0 = a year ago … 364 = today. */
  day: number;
  playedAt: Date;
  timeControl: string;
  userColor: PlayerColor;
  result: DemoResult;
  pgnResult: '1-0' | '0-1' | '1/2-1/2';
  opponentName: string;
  opponentRating: number;
  /** The rating the site shows for the player at the time: smooth, and lagging
   * their true strength a little (unlike the noisy per-game estimate below). */
  platformRating: number;
  estimatedRating: number;
  opening: DemoOpening;
  reachedEndgame: boolean;
}

/** How many games each day holds: more at weekends, the odd rest day, and a
 * slow first fortnight while the habit forms. Scaled so the total is exact. */
export function gamesPerDay(rng: Rng, totalGames: number, days: number): number[] {
  const weights = Array.from({ length: days }, (_, day) => {
    if (rng() < 0.06) return 0;
    const weekend = day % 7 >= 5 ? 1.35 : 1;
    const habit = 0.55 + 0.45 * Math.min(1, day / 30);
    return weekend * habit * Math.exp(gaussian(rng, 0, 0.45));
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((weight) => (weight / sum) * totalGames);
  const counts = exact.map((value) => Math.min(MAX_GAMES_PER_DAY, Math.floor(value)));
  const byRemainder = exact.map((value, day) => ({ day, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder);
  let missing = totalGames - counts.reduce((a, b) => a + b, 0);
  for (let pass = 0; missing > 0 && pass < MAX_GAMES_PER_DAY; pass++) {
    for (const { day } of byRemainder) {
      if (missing === 0) break;
      if ((counts[day] as number) >= MAX_GAMES_PER_DAY || weights[day] === 0) continue;
      counts[day] = (counts[day] as number) + 1;
      missing -= 1;
    }
  }
  return counts;
}

function chooseOpening(rng: Rng, day: number, userColor: PlayerColor): DemoOpening {
  const unnamedChance = clamp(0.6 - day / 70, 0.04, 0.6);
  if (rng() < unnamedChance) return pick(rng, UNNAMED_OPENINGS.filter((opening) => opening.as === userColor));
  // Early on the player samples everything; later they settle into a repertoire.
  const focus = clamp(day / 150, 0, 1);
  const options = DEMO_OPENINGS.filter((opening) => opening.as === userColor).map((opening) => ({ item: opening, weight: opening.weight ** focus }));
  return pickWeighted(rng, options);
}

/** Matchmaking pairs the player with people around their *platform* rating,
 * which lags behind a fast-improving player — that is why a climber wins more than half. */
function opponentRatingOnDay(rng: Rng, day: number): number {
  const rate = trueRatingOnDay(day + 7) - trueRatingOnDay(day);
  const lag = clamp(rate * 1.4, 30, 90);
  return Math.round(gaussian(rng, trueRatingOnDay(day) - lag, 60));
}

function resultFor(rng: Rng, day: number, opponentRating: number): DemoResult {
  const expected = 1 / (1 + 10 ** ((opponentRating - trueRatingOnDay(day)) / 400));
  const drawChance = 0.05;
  const winChance = clamp(expected - drawChance / 2, 0.02, 0.97);
  const roll = rng();
  return roll < winChance ? 'win' : roll < winChance + drawChance ? 'draw' : 'loss';
}

function pgnResultFor(result: DemoResult, userColor: PlayerColor): PlannedGame['pgnResult'] {
  if (result === 'draw') return '1/2-1/2';
  return (result === 'win') === (userColor === 'white') ? '1-0' : '0-1';
}

function timeControlFor(rng: Rng): string {
  return rng() < 0.92 ? '600+0' : '600+5';
}

/** Games played on one day, spaced ~14 minutes apart through the evening; the
 * final day is laid out backwards from `now` so nothing is dated in the future. */
function playTimes(rng: Rng, dayStart: Date, count: number, isToday: boolean, now: Date): Date[] {
  if (isToday) return Array.from({ length: count }, (_, i) => new Date(now.getTime() - (count - i) * 13 * MS_PER_MINUTE));
  const start = dayStart.getTime() + (16.5 + rng() * 3) * 60 * MS_PER_MINUTE;
  let cursor = start;
  return Array.from({ length: count }, () => {
    const time = new Date(cursor);
    cursor += clamp(gaussian(rng, 14, 3), 9, 24) * MS_PER_MINUTE;
    return time;
  });
}

/** `lastDay` is the day of the journey that is "today": 364 for the full year,
 * 34 for the player six weeks in. */
export function planGames(rng: Rng, totalGames: number, now: Date, lastDay = YEAR_DAYS - 1): PlannedGame[] {
  const counts = gamesPerDay(rng, totalGames, lastDay + 1);
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const games: PlannedGame[] = [];

  counts.forEach((count, day) => {
    const dayStart = new Date(todayStart.getTime() - (lastDay - day) * MS_PER_DAY);
    const times = playTimes(rng, dayStart, count, day === lastDay, now);
    times.forEach((playedAt) => {
      // Sites alternate colours; the odd flip keeps it from looking scripted.
      const alternating: PlayerColor = games.length % 2 === 0 ? 'white' : 'black';
      const userColor: PlayerColor = rng() < COLOUR_FLIP_CHANCE ? (alternating === 'white' ? 'black' : 'white') : alternating;
      const opponentRating = opponentRatingOnDay(rng, day);
      const result = resultFor(rng, day, opponentRating);
      games.push({
        day,
        playedAt,
        timeControl: timeControlFor(rng),
        userColor,
        result,
        pgnResult: pgnResultFor(result, userColor),
        opponentName: opponentName(rng),
        opponentRating,
        platformRating: trueRatingOnDay(day) - PLATFORM_RATING_LAG,
        estimatedRating: estimatedRatingOnDay(rng, day),
        opening: chooseOpening(rng, day, userColor),
        reachedEndgame: rng() < 0.45
      });
    });
  });
  return games;
}
