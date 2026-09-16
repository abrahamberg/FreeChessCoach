import type { BotConfig } from './bot.js';
import { documentedDiagnosisCodes } from './bot-roster.js';

/**
 * Curated roster of preset bots (chess.com-style) — the whole roster for v1,
 * no DB table, no user-facing builder. `games.bot_config_snapshot` freezes a
 * copy of one of these at game-start time, so editing an entry here never
 * rewrites the story of an already-played game.
 *
 * Grouped into five skill tiers (Beginner, Developing, Intermediate,
 * Advanced, Expert), six bots each, in the same order as the portrait sheet
 * at public/brand/bots.png (row = tier, column = position within the tier —
 * `avatarIndex` is `row * 6 + column`). `elo` (300-2300) is a display rating
 * only — search depth is fixed for every bot (bot-candidates.ts's
 * BOT_SEARCH_DEPTH), never a per-bot lever. The knobs that actually make a
 * bot play weaker/stronger/differently are `topFiveChance` /
 * `bestMoveGivenTopFiveChance` / `blunderGivenMissChance` (the %A/%B/%C
 * decision tree, bot-move-pick.ts's pickBotMove — literal values from the
 * roster's own worked table, docs/plan-bot-engine.md Phase 64, not derived
 * from `elo`), `personality`, and the opening-book pair.
 *
 * `diagnosisCodes` (Phase 61, widened by Phase 62) documents each bot's
 * real blind spots against the same diagnosis-code taxonomy the coach uses
 * on real students (`packages/shared/src/diagnosis/`), restricted to
 * `bot-roster.ts`'s `ELIGIBLE_DIAGNOSIS_CODES` — the 19 `TA-*`/`BV-*`/`MS-*`
 * codes a bot's own move selection can actually be steered toward
 * (`pickBotMove`, docs/plan.md Phase 62), scaled by elo via
 * `documentedDiagnosisCodes`. Every other family in the 410-code catalog
 * (calculation depth beyond a single ply, time management, psychology,
 * opening prep beyond the book mechanism already covered by
 * `bookMistakeChance`, endgame technique, learning habits, strategic
 * planning) describes a mechanism this bot's single-move selection has no
 * way to distinguishably manifest — tagging a bot with one of those would
 * be a claim the code can't back up. An empty list is a legitimate, honest
 * value for a well-rounded or highly disciplined bot, not a gap to fill.
 * Trailing comments below explain the less-obvious signature picks; the
 * elo-scaled bulk fill is explained once, in `bot-roster.ts`, rather than
 * per bot.
 */
export const BOT_ROSTER: readonly BotConfig[] = [
  // --- Beginner ---
  {
    id: 'nate-brooks',
    name: 'Nate Brooks',
    avatarIndex: 0,
    description: '"The Newcomer." Moves fast, attacks early, and often forgets what you\'re threatening.',
    elo: 300,
    topFiveChance: 0.1,
    bestMoveGivenTopFiveChance: 0.3,
    blunderGivenMissChance: 0.667,
    personality: { aggression: 70, trapSeeking: 20, defensiveness: 10 },
    mateConversionChance: 0.55,
    diagnosisCodes: documentedDiagnosisCodes(['TA-43', 'TA-01'], 300),
    bookPlies: 2,
    bookMistakeChance: 0.5
  },
  {
    id: 'clara-lind',
    name: 'Clara Lind',
    avatarIndex: 1,
    description: '"The Curious." Plays carefully and experiments with new ideas instead of the safe move.',
    elo: 350,
    topFiveChance: 0.12,
    bestMoveGivenTopFiveChance: 0.333,
    blunderGivenMissChance: 0.636,
    personality: { aggression: 35, trapSeeking: 45, defensiveness: 40 },
    mateConversionChance: 0.56,
    diagnosisCodes: documentedDiagnosisCodes(['TA-19', 'TA-08'], 350),
    bookPlies: 3,
    bookMistakeChance: 0.4
  },
  {
    id: 'carl-mendes',
    name: 'Carl Mendes',
    avatarIndex: 2,
    description: '"The Club Regular." Sticks to familiar openings and solid development, avoids unnecessary risk.',
    elo: 420,
    topFiveChance: 0.19,
    bestMoveGivenTopFiveChance: 0.316,
    blunderGivenMissChance: 0.494,
    personality: { aggression: 20, trapSeeking: 15, defensiveness: 65 },
    mateConversionChance: 0.84,
    diagnosisCodes: documentedDiagnosisCodes(['TA-19'], 420),
    bookPlies: 6,
    bookMistakeChance: 0.25
  },
  {
    id: 'tara-okafor',
    name: 'Tara Okafor',
    avatarIndex: 3,
    description: '"The Puzzle Hunter." Constantly searches for forks, pins, and discoveries — sound or not.',
    elo: 380,
    topFiveChance: 0.14,
    bestMoveGivenTopFiveChance: 0.286,
    blunderGivenMissChance: 0.558,
    personality: { aggression: 45, trapSeeking: 80, defensiveness: 15 },
    mateConversionChance: 0.63,
    diagnosisCodes: documentedDiagnosisCodes(['TA-12', 'TA-19'], 380), // tactics-obsessed but reckless ("sound or not"); already handles forks via high trapSeeking, so her documented gap is the subtler patterns she rushes past
    bookPlies: 2,
    bookMistakeChance: 0.45
  },
  {
    id: 'sam-novak',
    name: 'Sam Novak',
    avatarIndex: 4,
    description: '"The Planner." Builds a clear plan but sometimes misses a tactic sitting right in front of it.',
    elo: 400,
    topFiveChance: 0.16,
    bestMoveGivenTopFiveChance: 0.312,
    blunderGivenMissChance: 0.536,
    personality: { aggression: 30, trapSeeking: 10, defensiveness: 45 },
    mateConversionChance: 0.77,
    diagnosisCodes: documentedDiagnosisCodes(['TA-43', 'TA-07'], 400),
    bookPlies: 4,
    bookMistakeChance: 0.35
  },
  {
    id: 'sophie-chen',
    name: 'Sophie Chen',
    avatarIndex: 5,
    description: '"The Prodigy." Balanced, accurate, adaptable, and surprisingly hard to rattle for her level.',
    elo: 500,
    topFiveChance: 0.27,
    bestMoveGivenTopFiveChance: 0.37,
    blunderGivenMissChance: 0.411,
    personality: { aggression: 40, trapSeeking: 40, defensiveness: 40 },
    mateConversionChance: 0.98,
    diagnosisCodes: documentedDiagnosisCodes([], 500),
    bookPlies: 8,
    bookMistakeChance: 0.15
  },

  // --- Developing ---
  {
    id: 'alex-romero',
    name: 'Alex Romero',
    avatarIndex: 6,
    description: '"The Storm." Attacks aggressively, sacrifices material freely, and hates quiet positions.',
    elo: 600,
    topFiveChance: 0.37,
    bestMoveGivenTopFiveChance: 0.405,
    blunderGivenMissChance: 0.317,
    personality: { aggression: 85, trapSeeking: 35, defensiveness: 10 },
    mateConversionChance: 0.7,
    diagnosisCodes: documentedDiagnosisCodes(['TA-43', 'TA-04'], 600),
    bookPlies: 5,
    bookMistakeChance: 0.25
  },
  {
    id: 'steven-anders',
    name: 'Steven Anders',
    avatarIndex: 7,
    description: '"The Anchor." Develops safely, protects every weakness, and rarely makes a reckless move.',
    elo: 650,
    topFiveChance: 0.43,
    bestMoveGivenTopFiveChance: 0.419,
    blunderGivenMissChance: 0.263,
    personality: { aggression: 10, trapSeeking: 15, defensiveness: 85 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes([], 650),
    bookPlies: 8,
    bookMistakeChance: 0.15
  },
  {
    id: 'chloe-bennett',
    name: 'Chloe Bennett',
    avatarIndex: 8,
    description: '"The Inventor." Finds unusual plans and surprising sacrifices instead of the obvious move.',
    elo: 620,
    topFiveChance: 0.39,
    bestMoveGivenTopFiveChance: 0.41,
    blunderGivenMissChance: 0.295,
    personality: { aggression: 55, trapSeeking: 50, defensiveness: 20 },
    mateConversionChance: 0.63,
    diagnosisCodes: documentedDiagnosisCodes(['TA-07', 'TA-18'], 620), // seeks the unusual plan over the obvious one — sometimes that obvious move was the correct tactic
    bookPlies: 3,
    bookMistakeChance: 0.3
  },
  {
    id: 'calvin-park',
    name: 'Calvin Park',
    avatarIndex: 9,
    description: '"The Calculator." Calculates deeply and precisely, one line at a time.',
    elo: 700,
    topFiveChance: 0.5,
    bestMoveGivenTopFiveChance: 0.44,
    blunderGivenMissChance: 0.22,
    personality: { aggression: 35, trapSeeking: 45, defensiveness: 40 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes(['TA-19'], 700), // "one line at a time" — deep in a single calculated line, occasionally misses a tactical resource elsewhere on the board
    bookPlies: 6,
    bookMistakeChance: 0.15
  },
  {
    id: 'diana-moretti',
    name: 'Diana Moretti',
    avatarIndex: 10,
    description: '"The Chameleon." Switches easily between aggressive and positional play mid-game.',
    elo: 680,
    topFiveChance: 0.47,
    bestMoveGivenTopFiveChance: 0.426,
    blunderGivenMissChance: 0.245,
    personality: { aggression: 50, trapSeeking: 35, defensiveness: 35 },
    mateConversionChance: 0.7,
    diagnosisCodes: documentedDiagnosisCodes(['TA-16'], 680), // switches styles mid-game; a discovered attack (noticing a move unlocks another piece) is easy to miss between modes
    bookPlies: 5,
    bookMistakeChance: 0.2
  },
  {
    id: 'paul-mensah',
    name: 'Paul Mensah',
    avatarIndex: 11,
    description: '"The Architect." Improves his position slowly and values structure over tactics.',
    elo: 750,
    topFiveChance: 0.55,
    bestMoveGivenTopFiveChance: 0.455,
    blunderGivenMissChance: 0.2,
    personality: { aggression: 15, trapSeeking: 10, defensiveness: 75 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes(['TA-07', 'TA-18', 'TA-43'], 750),
    bookPlies: 10,
    bookMistakeChance: 0.1
  },

  // --- Intermediate ---
  {
    id: 'tony-varga',
    name: 'Tony Varga',
    avatarIndex: 12,
    description: '"The Tactician." Creates complications and searches relentlessly for forcing moves.',
    elo: 1150,
    topFiveChance: 0.79,
    bestMoveGivenTopFiveChance: 0.62,
    blunderGivenMissChance: 0.143,
    personality: { aggression: 65, trapSeeking: 90, defensiveness: 20 },
    mateConversionChance: 0.98,
    diagnosisCodes: documentedDiagnosisCodes(['TA-12'], 1150), // highest trapSeeking in the roster — already excellent at forks; the one gap left is the subtler pin variant
    bookPlies: 8,
    bookMistakeChance: 0.12
  },
  {
    id: 'ella-fischer',
    name: 'Ella Fischer',
    avatarIndex: 13,
    description: '"The Finisher." Trades patiently, neutralizes danger, and converts small edges accurately.',
    elo: 1100,
    topFiveChance: 0.78,
    bestMoveGivenTopFiveChance: 0.603,
    blunderGivenMissChance: 0.136,
    personality: { aggression: 20, trapSeeking: 25, defensiveness: 70 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes([], 1100),
    bookPlies: 10,
    bookMistakeChance: 0.08
  },
  {
    id: 'raj-patel',
    name: 'Raj Patel',
    avatarIndex: 14,
    description: '"The Survivor." Defends resourcefully, sets practical problems, and refuses to resign early.',
    elo: 1000,
    topFiveChance: 0.7,
    bestMoveGivenTopFiveChance: 0.571,
    blunderGivenMissChance: 0.167,
    personality: { aggression: 25, trapSeeking: 45, defensiveness: 75 },
    mateConversionChance: 0.91,
    diagnosisCodes: documentedDiagnosisCodes(['TA-18'], 1000),
    bookPlies: 6,
    bookMistakeChance: 0.15
  },
  {
    id: 'fiona-reyes',
    name: 'Fiona Reyes',
    avatarIndex: 15,
    description: '"The Fearless." Welcomes complications and accepts sacrifices with total confidence.',
    elo: 1150,
    topFiveChance: 0.77,
    bestMoveGivenTopFiveChance: 0.623,
    blunderGivenMissChance: 0.174,
    personality: { aggression: 75, trapSeeking: 60, defensiveness: 15 },
    mateConversionChance: 0.84,
    diagnosisCodes: documentedDiagnosisCodes(['TA-04', 'TA-17'], 1150), // welcomes chaos she doesn't fully control — neglects her own back rank and the double-check that complications can produce
    bookPlies: 7,
    bookMistakeChance: 0.15
  },
  {
    id: 'ethan-cole',
    name: 'Ethan Cole',
    avatarIndex: 16,
    description: '"The Veteran." Leans on decades of experience, avoiding unnecessary calculation.',
    elo: 1250,
    topFiveChance: 0.87,
    bestMoveGivenTopFiveChance: 0.644,
    blunderGivenMissChance: 0.154,
    personality: { aggression: 35, trapSeeking: 30, defensiveness: 55 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes(['TA-19', 'TA-14'], 1250), // "avoiding unnecessary calculation" — skips the precise reading these two patterns require
    bookPlies: 14,
    bookMistakeChance: 0.06
  },
  {
    id: 'ruby-tanaka',
    name: 'Ruby Tanaka',
    avatarIndex: 17,
    description: '"The Rising Star." Plays ambitious, energetic chess backed by strong preparation.',
    elo: 1300,
    topFiveChance: 0.9,
    bestMoveGivenTopFiveChance: 0.667,
    blunderGivenMissChance: 0.1,
    personality: { aggression: 60, trapSeeking: 50, defensiveness: 30 },
    mateConversionChance: 0.98,
    diagnosisCodes: documentedDiagnosisCodes(['TA-11'], 1300), // energetic and well-prepared, but a static absolute pin isn't the kind of pattern preparation catches
    bookPlies: 12,
    bookMistakeChance: 0.08
  },

  // --- Advanced ---
  {
    id: 'marcus-king',
    name: 'Marcus King',
    avatarIndex: 18,
    description: '"The Grinder." Extends games, keeps up the pressure, and waits for you to collapse.',
    elo: 1550,
    topFiveChance: 0.96,
    bestMoveGivenTopFiveChance: 0.76,
    blunderGivenMissChance: 0.125,
    personality: { aggression: 30, trapSeeking: 30, defensiveness: 70 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes(['TA-19'], 1550), // grinds for the long game — a sudden overload tactic isn't what patient pressure is tuned to notice
    bookPlies: 12,
    bookMistakeChance: 0.06
  },
  {
    id: 'maya-das',
    name: 'Maya Das',
    avatarIndex: 19,
    description: '"The Queen Hunter." Gains tempo through threats and hunts your loose or exposed pieces.',
    elo: 1600,
    topFiveChance: 0.96,
    bestMoveGivenTopFiveChance: 0.781,
    blunderGivenMissChance: 0.125,
    personality: { aggression: 70, trapSeeking: 75, defensiveness: 20 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes(['TA-26'], 1600), // hunts loose pieces generally, but a fully trapped piece (the more advanced version of that pattern) is a specific gap
    bookPlies: 10,
    bookMistakeChance: 0.08
  },
  {
    id: 'marco-silva',
    name: 'Marco Silva',
    avatarIndex: 20,
    description: '"The Marathoner." Calculates steadily and stays accurate deep into long games.',
    elo: 1700,
    topFiveChance: 0.98,
    bestMoveGivenTopFiveChance: 0.827,
    blunderGivenMissChance: 0.1,
    personality: { aggression: 35, trapSeeking: 35, defensiveness: 55 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes([], 1700),
    bookPlies: 12,
    bookMistakeChance: 0.05
  },
  {
    id: 'leo-haddad',
    name: 'Leo Haddad',
    avatarIndex: 21,
    description: '"The Improviser." Steps off known theory early, trusting intuition over preparation.',
    elo: 1500,
    topFiveChance: 0.95,
    bestMoveGivenTopFiveChance: 0.737,
    blunderGivenMissChance: 0.2,
    personality: { aggression: 55, trapSeeking: 55, defensiveness: 25 },
    mateConversionChance: 0.7,
    diagnosisCodes: documentedDiagnosisCodes(['TA-18'], 1500),
    bookPlies: 3,
    bookMistakeChance: 0.4
  },
  {
    id: 'viktor-hahn',
    name: 'Viktor Hahn',
    avatarIndex: 22,
    description: '"The Iron Wall." Eliminates weaknesses, absorbs attacks, and frustrates aggressive opponents.',
    elo: 1750,
    topFiveChance: 0.98,
    bestMoveGivenTopFiveChance: 0.847,
    blunderGivenMissChance: 0.1,
    personality: { aggression: 10, trapSeeking: 20, defensiveness: 90 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes([], 1750),
    bookPlies: 14,
    bookMistakeChance: 0.04
  },
  {
    id: 'arun-kapoor',
    name: 'Arun Kapoor',
    avatarIndex: 23,
    description: '"The Sniper." Waits quietly for one weakness, then finishes with a short forcing sequence.',
    elo: 1650,
    topFiveChance: 0.97,
    bestMoveGivenTopFiveChance: 0.804,
    blunderGivenMissChance: 0.1,
    personality: { aggression: 45, trapSeeking: 80, defensiveness: 45 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes(['TA-12'], 1650), // precise and tactically sharp; the one gap is the subtler pin variant, distinct from his signature forcing finishes
    bookPlies: 10,
    bookMistakeChance: 0.06
  },

  // --- Expert ---
  {
    id: 'hannah-torres',
    name: 'Hannah Torres',
    avatarIndex: 24,
    description: '"The Hustler." Reads opponents quickly and sets practical traps that pay off under pressure.',
    elo: 2000,
    topFiveChance: 0.99,
    bestMoveGivenTopFiveChance: 0.899,
    blunderGivenMissChance: 0.1,
    personality: { aggression: 55, trapSeeking: 80, defensiveness: 30 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes(['TA-09'], 2000), // sets practical traps under pressure, but the king fork specifically escapes the pattern she leans on
    bookPlies: 12,
    bookMistakeChance: 0.05
  },
  {
    id: 'elias-grant',
    name: 'Professor Elias Grant',
    avatarIndex: 25,
    description: '"The Theorist." Deep opening knowledge and classical principles, applied with total discipline.',
    elo: 2200,
    topFiveChance: 0.994,
    bestMoveGivenTopFiveChance: 0.936,
    blunderGivenMissChance: 0.167,
    personality: { aggression: 30, trapSeeking: 30, defensiveness: 55 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes([], 2200),
    bookPlies: 20,
    bookMistakeChance: 0.02
  },
  {
    id: 'william-hart',
    name: 'William Hart',
    avatarIndex: 26,
    description: '"The Wildcard." Chooses sharp sidelines that force you to think for yourself early.',
    elo: 2050,
    topFiveChance: 0.99,
    bestMoveGivenTopFiveChance: 0.909,
    blunderGivenMissChance: 0.1,
    personality: { aggression: 60, trapSeeking: 55, defensiveness: 25 },
    mateConversionChance: 0.91,
    diagnosisCodes: documentedDiagnosisCodes(['TA-16'], 2050), // sharp, chaotic sidelines create the kind of position where a quieter discovered attack goes unnoticed
    bookPlies: 10,
    bookMistakeChance: 0.08
  },
  {
    id: 'yuna-seo',
    name: 'Yuna Seo',
    avatarIndex: 27,
    description: '"The Ice Queen." Controlled, clinical chess that snuffs out counterplay before converting.',
    elo: 2300,
    topFiveChance: 0.995,
    bestMoveGivenTopFiveChance: 0.955,
    blunderGivenMissChance: 0.2,
    personality: { aggression: 25, trapSeeking: 35, defensiveness: 75 },
    mateConversionChance: 0.99,
    diagnosisCodes: documentedDiagnosisCodes([], 2300),
    bookPlies: 16,
    bookMistakeChance: 0.02
  },
  {
    id: 'mateo-cruz',
    name: 'Mateo Cruz',
    avatarIndex: 28,
    description: '"The Comeback Kid." Builds resilient defenses and turns dangerous the moment you relax.',
    elo: 1950,
    topFiveChance: 0.99,
    bestMoveGivenTopFiveChance: 0.889,
    blunderGivenMissChance: 0.1,
    personality: { aggression: 45, trapSeeking: 55, defensiveness: 60 },
    mateConversionChance: 0.98,
    diagnosisCodes: documentedDiagnosisCodes(['TA-19'], 1950), // resilient and balanced, but the sudden-overload pattern isn't what a defense-to-offense mindset is tuned to catch
    bookPlies: 10,
    bookMistakeChance: 0.1
  },
  {
    id: 'adrian-laurent',
    name: 'Adrian Laurent',
    avatarIndex: 29,
    description: '"The Artist." Favors harmonious attacks and elegant sacrifices over the merely correct move.',
    elo: 2150,
    topFiveChance: 0.993,
    bestMoveGivenTopFiveChance: 0.926,
    blunderGivenMissChance: 0.143,
    personality: { aggression: 70, trapSeeking: 70, defensiveness: 20 },
    mateConversionChance: 0.98,
    diagnosisCodes: documentedDiagnosisCodes(['TA-10'], 2150), // prefers the elegant move to the merely correct one — the plain sliding-piece fork is exactly the "merely correct" move he'd rather not play
    bookPlies: 10,
    bookMistakeChance: 0.06
  }
] as const;

export function findBotConfig(id: string): BotConfig | undefined {
  return BOT_ROSTER.find((bot) => bot.id === id);
}
