/** The five engine-analyzed fixture games (./games/*.pgn) and when the demo
 * player "played" them, relative to today so a re-seed never leaves stale
 * dates. Each is a real game with real analysis; the lessons in
 * beginner-lessons.ts describe what the engine actually found in them. */
export const REAL_GAME_KEYS = ['featured', 'scotchWin', 'londonWin', 'caroTrap', 'caroGreed'] as const;
export type RealGameKey = (typeof REAL_GAME_KEYS)[number];

export interface RealGameSpec {
  key: RealGameKey;
  file: string;
  daysAgo: number;
  hourUtc: number;
}

export const REAL_GAMES: readonly RealGameSpec[] = [
  { key: 'caroGreed', file: 'caro-loss-queen-grab.pgn', daysAgo: 16, hourUtc: 18 },
  { key: 'caroTrap', file: 'caro-loss-trapped-bishop.pgn', daysAgo: 10, hourUtc: 19 },
  { key: 'londonWin', file: 'london-win-no-recapture.pgn', daysAgo: 7, hourUtc: 20 },
  { key: 'featured', file: 'featured-caro-missed-rook.pgn', daysAgo: 4, hourUtc: 19 },
  { key: 'scotchWin', file: 'scotch-win-missed-mates.pgn', daysAgo: 2, hourUtc: 18 }
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** When the game was played: `daysAgo` days before `now`, at `hourUtc`. */
export function playedAtFor(spec: Pick<RealGameSpec, 'daysAgo' | 'hourUtc'>, now: Date): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - spec.daysAgo * MS_PER_DAY);
  return new Date(day.getTime() + spec.hourUtc * 60 * 60 * 1000);
}

/** Rewrites the PGN's `[Date]` (and adds `[UTCTime]`) so the imported game carries `playedAt`. */
export function withPlayedAt(pgn: string, playedAt: Date): string {
  const iso = playedAt.toISOString();
  const date = iso.slice(0, 10).replaceAll('-', '.');
  const time = iso.slice(11, 19);
  const withoutOld = pgn.replace(/^\[(Date|UTCDate|UTCTime) "[^"]*"\]\n/gm, '');
  return withoutOld.replace(/^(\[Event [^\n]*\]\n)/, `$1[Date "${date}"]\n[UTCTime "${time}"]\n`);
}
