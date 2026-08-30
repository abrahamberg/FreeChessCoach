/**
 * Dev-only: seeds the dev-stub user (dev@local.test, see
 * src/plugins/auth-headers.ts's DEV_STUB_USER) with a realistic spread of
 * imported + analyzed games, so the Games list and /stats dashboard have
 * something to look at on a fresh local `npm run dev` stack.
 *
 * Writes real rows straight through the repositories (bypassing the API/
 * engine) rather than importing real PGNs and waiting on Stockfish, since the
 * goal here is *variety* across ranges/speeds/openings/tactics, not
 * engine-accurate analysis.
 *
 * Usage (from repo root, with the dev docker-compose Postgres up):
 *   DATABASE_URL=postgresql://chess_coach:chess_coach@localhost:5432/chess_coach \
 *     npx tsx apps/api/scripts/seed-dev-stats.ts
 * (DATABASE_URL defaults to that same value if unset.)
 */
import {
  ENDGAME_STANDINGS,
  ENDGAME_THEMES,
  GameReportSchema,
  MOVE_QUALITIES,
  TACTIC_MOTIF_TYPES,
  type BookReport,
  type ClassificationCounts,
  type EndgameStanding,
  type EndgameTheme,
  type GameReport,
  type PlayerColor,
  type PlayerReport,
  type TacticMotifType
} from '@freechesscoach/shared';
import { createDb } from '../src/db/index.js';
import * as analysesRepo from '../src/db/repositories/analyses.js';
import * as gamesRepo from '../src/db/repositories/games.js';
import * as usersRepo from '../src/db/repositories/users.js';
import { resultForColour } from '../src/services/build-game-report.js';

const DEV_USER_EMAIL = 'dev@local.test';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface OpeningTemplate {
  plies: string[];
  book: Pick<BookReport, 'eco' | 'ecoVolume' | 'name' | 'family' | 'variation'> | null;
}

const OPENINGS: OpeningTemplate[] = [
  {
    plies: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'Re1', 'a6', 'h3', 'h6'],
    book: { eco: 'C50', ecoVolume: 'C', name: 'Italian Game', family: 'Italian Game', variation: 'Giuoco Piano' }
  },
  {
    plies: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2', 'e5', 'Nb3', 'Be7', 'O-O', 'O-O'],
    book: { eco: 'B90', ecoVolume: 'B', name: 'Sicilian Defense', family: 'Sicilian Defense', variation: 'Najdorf Variation' }
  },
  {
    plies: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6', 'Bh4', 'b6', 'cxd5', 'Nxd5'],
    book: { eco: 'D35', ecoVolume: 'D', name: "Queen's Gambit Declined", family: "Queen's Gambit Declined", variation: 'Exchange Variation' }
  },
  {
    plies: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7', 'Qg4', 'O-O', 'Bd3', 'Nbc6'],
    book: { eco: 'C18', ecoVolume: 'C', name: 'French Defense', family: 'French Defense', variation: 'Winawer Variation' }
  },
  {
    plies: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6', 'Nf3', 'Nd7', 'h5', 'Bh7'],
    book: { eco: 'B18', ecoVolume: 'B', name: 'Caro-Kann Defense', family: 'Caro-Kann Defense', variation: 'Classical Variation' }
  },
  {
    // Deliberately book: null — exercises the "Unknown opening" bucket.
    plies: ['Nf3', 'Nf6', 'g3', 'g6', 'Bg2', 'Bg7', 'O-O', 'O-O', 'd3', 'd6', 'Nbd2', 'Nc6', 'e4', 'e5', 'c3', 'a5'],
    book: null
  }
];

const OPPONENTS = [
  'Magnus_Fan92',
  'ChessWizard',
  'RookieRook',
  'QueenSlayer',
  'KnightRider88',
  'PawnStormer',
  'BishopBaron',
  'EndgameEnjoyer'
];

function buildPgn(white: string, black: string, result: string, plies: string[]): string {
  const headers = [
    '[Event "Rated game"]',
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`
  ].join('\n');
  const movetext = plies
    .map((ply, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${ply}` : ply))
    .join(' ');
  return `${headers}\n\n${movetext} ${result}`;
}

function daysAgo(n: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}

function zeroCounts(): ClassificationCounts {
  return Object.fromEntries(MOVE_QUALITIES.map((q) => [q, 0])) as ClassificationCounts;
}

/** Distributes `total` plies across move qualities, skewed better for higher accuracy. */
function classificationCounts(rng: () => number, total: number, accuracy: number): ClassificationCounts {
  const counts = zeroCounts();
  const goodBias = accuracy / 100;
  for (let i = 0; i < total; i++) {
    const roll = rng();
    let quality: (typeof MOVE_QUALITIES)[number];
    if (roll < 0.05) quality = 'book';
    else if (roll < 0.05 + 0.15 * goodBias) quality = 'best';
    else if (roll < 0.05 + 0.4 * goodBias) quality = 'excellent';
    else if (roll < 0.05 + 0.65 * goodBias) quality = 'good';
    else if (roll < 0.8) quality = 'inaccuracy';
    else if (roll < 0.92) quality = 'mistake';
    else quality = 'blunder';
    counts[quality] += 1;
  }
  return counts;
}

function zeroTacticMotifs(): PlayerReport['tacticMotifs'] {
  return Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])) as PlayerReport['tacticMotifs'];
}

/** Scatters a handful of non-zero opportunity/found pairs so the tactics
 * dashboard section has something to show, rather than every motif reading 0/0. */
function tacticMotifs(rng: () => number): PlayerReport['tacticMotifs'] {
  const motifs = zeroTacticMotifs();
  const hitCount = 1 + Math.floor(rng() * 3);
  const types = [...TACTIC_MOTIF_TYPES].filter((t) => t !== 'other');
  for (let i = 0; i < hitCount; i++) {
    const type = types[Math.floor(rng() * types.length)] as TacticMotifType;
    const opportunities = motifs[type].opportunities + 1 + Math.floor(rng() * 2);
    const found = Math.min(opportunities, Math.floor(rng() * (opportunities + 1)));
    motifs[type] = { opportunities, found };
  }
  return motifs;
}

interface GameSpec {
  opening: OpeningTemplate;
  timeControl: string;
  userColor: PlayerColor;
  pgnResult: string;
  opponent: string;
  playedAt: Date;
  reachedEndgame: boolean;
}

function buildPlayerReport(rng: () => number, isUser: boolean, resultLabel: 'win' | 'loss' | 'draw', reachedEndgame: boolean): PlayerReport {
  const baseAccuracy = resultLabel === 'win' ? 78 + rng() * 15 : resultLabel === 'draw' ? 68 + rng() * 15 : 52 + rng() * 18;
  const accuracy = Math.round(Math.min(98, Math.max(35, baseAccuracy)));
  const openingAccuracy = Math.round(Math.min(100, Math.max(40, accuracy + (rng() * 10 - 5))));
  const middlegameAccuracy = Math.round(Math.min(100, Math.max(30, accuracy - 5 + rng() * 10)));
  const endgameAccuracy = reachedEndgame ? Math.round(Math.min(100, Math.max(20, accuracy - 8 + rng() * 16))) : null;

  const subScoreOf = () => (isUser && rng() < 0.15 ? null : Math.round(Math.min(98, Math.max(30, accuracy - 10 + rng() * 25))));

  return {
    accuracy,
    phaseAccuracy: { opening: openingAccuracy, middlegame: middlegameAccuracy, endgame: endgameAccuracy },
    phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: reachedEndgame ? 'ok' : 'none' },
    scores: {
      opening: openingAccuracy,
      tactics: Math.round(Math.min(98, Math.max(30, accuracy - 5 + rng() * 15))),
      strategy: subScoreOf(),
      endgame: endgameAccuracy
    },
    strategySubScores: {
      pawnStructure: subScoreOf(),
      spaceAdvantage: subScoreOf(),
      activePiece: subScoreOf(),
      attacking: subScoreOf(),
      defending: subScoreOf()
    },
    endgame: reachedEndgame
      ? {
          standing: ENDGAME_STANDINGS[Math.floor(rng() * ENDGAME_STANDINGS.length)] as EndgameStanding,
          theme: ENDGAME_THEMES[Math.floor(rng() * ENDGAME_THEMES.length)] as EndgameTheme
        }
      : { standing: null, theme: null },
    counts: classificationCounts(rng, 18 + Math.floor(rng() * 20), accuracy),
    acpl: Math.round(Math.max(8, 70 - accuracy / 2 + rng() * 15)),
    estimatedRating: {
      value: Math.round(1200 + accuracy * 7 + rng() * 100),
      range: [Math.round(1100 + accuracy * 7), Math.round(1300 + accuracy * 7)],
      confidence: 'medium'
    },
    tacticMotifs: tacticMotifs(rng)
  };
}

function buildGameReport(spec: GameSpec, seed: number): GameReport {
  const rng = mulberry32(seed);
  const userResult = resultForColour(spec.pgnResult, spec.userColor);
  const opponentColor: PlayerColor = spec.userColor === 'white' ? 'black' : 'white';
  const opponentResult = resultForColour(spec.pgnResult, opponentColor);

  const book: BookReport = spec.opening.book
    ? {
        source: 'lichess-chess-openings@2024.01',
        eco: spec.opening.book.eco,
        ecoVolume: spec.opening.book.ecoVolume,
        name: spec.opening.book.name,
        family: spec.opening.book.family,
        variation: spec.opening.book.variation,
        namedAtPly: 4,
        lastBookPly: 10,
        players: {
          white: { lastBookPly: 10, leftBookPly: 11, leftBookMove: spec.opening.plies[10] ?? null, bookAlternatives: [] },
          black: { lastBookPly: 10, leftBookPly: 11, leftBookMove: spec.opening.plies[11] ?? null, bookAlternatives: [] }
        }
      }
    : {
        source: 'lichess-chess-openings@2024.01',
        eco: null,
        ecoVolume: null,
        name: null,
        family: null,
        variation: null,
        namedAtPly: null,
        lastBookPly: 6,
        players: {
          white: { lastBookPly: 6, leftBookPly: 7, leftBookMove: spec.opening.plies[6] ?? null, bookAlternatives: [] },
          black: { lastBookPly: 6, leftBookPly: 7, leftBookMove: spec.opening.plies[7] ?? null, bookAlternatives: [] }
        }
      };

  const whiteReport = buildPlayerReport(rng, spec.userColor === 'white', spec.userColor === 'white' ? userResult : opponentResult, spec.reachedEndgame);
  const blackReport = buildPlayerReport(rng, spec.userColor === 'black', spec.userColor === 'black' ? userResult : opponentResult, spec.reachedEndgame);

  return {
    engine: { name: 'stockfish', depth: 18, multiPv: 3 },
    book,
    phases: {
      openingEndPly: 12,
      endgameStartPly: spec.reachedEndgame ? 44 : null,
      openingSource: spec.opening.book ? 'book' : 'heuristic'
    },
    players: { white: whiteReport, black: blackReport },
    moves: []
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach';
  const db = createDb(connectionString);

  const existing = await usersRepo.findByEmail(db, DEV_USER_EMAIL);
  const user = existing ?? (await usersRepo.insert(db, { email: DEV_USER_EMAIL, displayName: DEV_USER_EMAIL }));
  console.log(`Seeding games for ${user.email} (${user.id})`);

  const rng = mulberry32(42);
  const specs: GameSpec[] = [];

  // Range spread: 2 within last7, 3 more within last30, 9 more within
  // last365, 4 older than a year (only shows under the 'all' range).
  const dayBuckets = [2, 5, 12, 20, 27, 40, 70, 95, 130, 160, 200, 240, 280, 330, 420, 560, 700, 900];
  const speeds = ['600+0', '600+5', '900+10', '180+2', '180+0', '60+0', '1800+0'];
  const results = ['1-0', '0-1', '1/2-1/2'];

  for (let i = 0; i < dayBuckets.length; i++) {
    const speed = i < 12 ? speeds[i % 3] : speeds[3 + (i % 4)]; // bias toward rapid (first 3 entries are rapid time controls)
    specs.push({
      opening: OPENINGS[i % OPENINGS.length]!,
      timeControl: speed!,
      userColor: i % 2 === 0 ? 'white' : 'black',
      pgnResult: results[i % results.length]!,
      opponent: OPPONENTS[i % OPPONENTS.length]!,
      playedAt: daysAgo(dayBuckets[i]!),
      reachedEndgame: rng() < 0.6
    });
  }

  let readyCount = 0;
  for (const [index, spec] of specs.entries()) {
    const white = spec.userColor === 'white' ? user.displayName : spec.opponent;
    const black = spec.userColor === 'black' ? user.displayName : spec.opponent;
    const pgn = buildPgn(white, black, spec.pgnResult, spec.opening.plies);

    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn,
      source: 'lichess',
      userColor: spec.userColor,
      whiteName: white,
      blackName: black,
      result: spec.pgnResult,
      timeControl: spec.timeControl,
      eco: spec.opening.book?.eco ?? null,
      playedAt: spec.playedAt
    });

    const analysis = await analysesRepo.insertQueued(db, game.id);
    const report = GameReportSchema.parse(buildGameReport(spec, 1000 + index));
    await analysesRepo.storeGameReport(db, analysis.id, report);
    await analysesRepo.updateStatus(db, analysis.id, 'ready');
    readyCount += 1;
  }

  // A couple of freshly-imported, not-yet-analyzed games (Task 31.3's "Not
  // analyzed" status/action) and one failed analysis, so the Games list shows
  // every status the app can produce.
  const notAnalyzed = OPENINGS[0]!;
  for (let i = 0; i < 2; i++) {
    const white = i % 2 === 0 ? user.displayName : OPPONENTS[i]!;
    const black = i % 2 === 0 ? OPPONENTS[i]! : user.displayName;
    await gamesRepo.insert(db, {
      userId: user.id,
      pgn: buildPgn(white, black, '1-0', notAnalyzed.plies),
      source: 'lichess',
      userColor: i % 2 === 0 ? 'white' : 'black',
      whiteName: white,
      blackName: black,
      result: '1-0',
      timeControl: '600+0',
      eco: notAnalyzed.book?.eco ?? null,
      playedAt: daysAgo(i + 1)
    });
  }

  const failedOpening = OPENINGS[1]!;
  const failedGame = await gamesRepo.insert(db, {
    userId: user.id,
    pgn: buildPgn(user.displayName, OPPONENTS[3]!, '0-1', failedOpening.plies),
    source: 'lichess',
    userColor: 'white',
    whiteName: user.displayName,
    blackName: OPPONENTS[3]!,
    result: '0-1',
    timeControl: '600+0',
    eco: failedOpening.book?.eco ?? null,
    playedAt: daysAgo(3)
  });
  const failedAnalysis = await analysesRepo.insertQueued(db, failedGame.id);
  await analysesRepo.markFailed(db, failedAnalysis.id, 'Engine timed out (seed data)');

  console.log(`Inserted ${readyCount} ready analyzed games, 2 not-analyzed games, 1 failed analysis.`);
  await db.destroy();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
