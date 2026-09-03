import type { BotConfig } from './bot.js';

/**
 * Curated roster of preset bots (chess.com-style) — the whole roster for v1,
 * no DB table, no user-facing builder. `games.bot_config_snapshot` freezes a
 * copy of one of these at game-start time, so editing an entry here never
 * rewrites the story of an already-played game.
 *
 * Grouped into five skill tiers (Beginner, Developing, Intermediate,
 * Advanced, Expert), six bots each, in the same order as the portrait sheet
 * at public/brand/bots.png (row = tier, column = position within the tier —
 * `avatarIndex` is `row * 6 + column`). `elo` (300-2300) is the display
 * rating; the knobs that actually make a bot play weaker/stronger/differently
 * are `phases` (per game-phase search depth and literal best-move
 * probability — see bot.ts's `BotPhaseProfileSchema`), `personality`, and
 * the opening-book pair.
 *
 * `diagnosisCodes` (docs/plan.md's Phase 61) documents each bot's tactical
 * blind spots against the same diagnosis-code taxonomy the coach uses on
 * real students (`packages/shared/src/diagnosis/`) — but ONLY drawn from
 * `MOTIF_RESOLVABLE_DIAGNOSIS_CODES` (packages/chess-analysis/src/diagnostics/motif-to-code.ts),
 * the 15 `TA-*` tactic-recognition codes a candidate move's own motif can
 * resolve to. Every other family in the 410-code catalog (scanning habits,
 * calculation depth, time management, psychology, opening prep, endgame
 * technique, learning habits) describes a mechanism this bot's single-move,
 * dice-roll-based selection has no way to distinguishably manifest — tagging
 * a bot with one of those would be a claim the code can't back up. When a
 * documented code matches the engine's own top candidate, `pickBotMove`
 * dampens the roll (`DIAGNOSED_BLIND_SPOT_CHANCE`) even below what the
 * bot's phase/tier would otherwise predict — so this is a real behavioral
 * property, not flavor text. An empty list is a legitimate, honest value
 * for a well-rounded or highly disciplined bot, not a gap to fill; a code
 * is assigned only where it's a defensible read of that bot's own
 * `description`/`personality`, not decoration. Trailing comments below
 * explain the less-obvious picks.
 */
export const BOT_ROSTER: readonly BotConfig[] = [
  // --- Beginner ---
  {
    id: 'nate-brooks',
    name: 'Nate Brooks',
    avatarIndex: 0,
    description: '"The Newcomer." Moves fast, attacks early, and often forgets what you\'re threatening.',
    elo: 300,
    phases: {
      opening: { depth: 3, bestMoveChance: 0.2 },
      middlegame: { depth: 3, bestMoveChance: 0.05 },
      endgame: { depth: 9, bestMoveChance: 0.3 }
    },
    personality: { aggression: 70, trapSeeking: 20, defensiveness: 10 },
    mateConversionChance: 0.55,
    diagnosisCodes: ['TA-43', 'TA-01'],
    bookPlies: 2,
    bookMistakeChance: 0.5
  },
  {
    id: 'clara-lind',
    name: 'Clara Lind',
    avatarIndex: 1,
    description: '"The Curious." Plays carefully and experiments with new ideas instead of the safe move.',
    elo: 350,
    phases: {
      opening: { depth: 4, bestMoveChance: 0.31 },
      middlegame: { depth: 4, bestMoveChance: 0.16 },
      endgame: { depth: 10, bestMoveChance: 0.41 }
    },
    personality: { aggression: 35, trapSeeking: 45, defensiveness: 40 },
    mateConversionChance: 0.56,
    diagnosisCodes: ['TA-19', 'TA-08'],
    bookPlies: 3,
    bookMistakeChance: 0.4
  },
  {
    id: 'carl-mendes',
    name: 'Carl Mendes',
    avatarIndex: 2,
    description: '"The Club Regular." Sticks to familiar openings and solid development, avoids unnecessary risk.',
    elo: 420,
    phases: {
      opening: { depth: 5, bestMoveChance: 0.59 },
      middlegame: { depth: 5, bestMoveChance: 0.44 },
      endgame: { depth: 11, bestMoveChance: 0.69 }
    },
    personality: { aggression: 20, trapSeeking: 15, defensiveness: 65 },
    mateConversionChance: 0.84,
    diagnosisCodes: ['TA-19'],
    bookPlies: 6,
    bookMistakeChance: 0.25
  },
  {
    id: 'tara-okafor',
    name: 'Tara Okafor',
    avatarIndex: 3,
    description: '"The Puzzle Hunter." Constantly searches for forks, pins, and discoveries — sound or not.',
    elo: 380,
    phases: {
      opening: { depth: 4, bestMoveChance: 0.38 },
      middlegame: { depth: 4, bestMoveChance: 0.23 },
      endgame: { depth: 10, bestMoveChance: 0.48 }
    },
    personality: { aggression: 45, trapSeeking: 80, defensiveness: 15 },
    mateConversionChance: 0.63,
    diagnosisCodes: ['TA-12', 'TA-19'], // tactics-obsessed but reckless ("sound or not"); already handles forks via high trapSeeking, so her documented gap is the subtler patterns she rushes past
    bookPlies: 2,
    bookMistakeChance: 0.45
  },
  {
    id: 'sam-novak',
    name: 'Sam Novak',
    avatarIndex: 4,
    description: '"The Planner." Builds a clear plan but sometimes misses a tactic sitting right in front of it.',
    elo: 400,
    phases: {
      opening: { depth: 5, bestMoveChance: 0.52 },
      middlegame: { depth: 5, bestMoveChance: 0.37 },
      endgame: { depth: 11, bestMoveChance: 0.62 }
    },
    personality: { aggression: 30, trapSeeking: 10, defensiveness: 45 },
    mateConversionChance: 0.77,
    diagnosisCodes: ['TA-43', 'TA-07'],
    bookPlies: 4,
    bookMistakeChance: 0.35
  },
  {
    id: 'sophie-chen',
    name: 'Sophie Chen',
    avatarIndex: 5,
    description: '"The Prodigy." Balanced, accurate, adaptable, and surprisingly hard to rattle for her level.',
    elo: 500,
    phases: {
      opening: { depth: 7, bestMoveChance: 0.73 },
      middlegame: { depth: 7, bestMoveChance: 0.58 },
      endgame: { depth: 13, bestMoveChance: 0.83 }
    },
    personality: { aggression: 40, trapSeeking: 40, defensiveness: 40 },
    mateConversionChance: 0.98,
    diagnosisCodes: [],
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
    phases: {
      opening: { depth: 7, bestMoveChance: 0.45 },
      middlegame: { depth: 7, bestMoveChance: 0.3 },
      endgame: { depth: 13, bestMoveChance: 0.55 }
    },
    personality: { aggression: 85, trapSeeking: 35, defensiveness: 10 },
    mateConversionChance: 0.7,
    diagnosisCodes: ['TA-43', 'TA-04'],
    bookPlies: 5,
    bookMistakeChance: 0.25
  },
  {
    id: 'steven-anders',
    name: 'Steven Anders',
    avatarIndex: 7,
    description: '"The Anchor." Develops safely, protects every weakness, and rarely makes a reckless move.',
    elo: 650,
    phases: {
      opening: { depth: 8, bestMoveChance: 0.87 },
      middlegame: { depth: 8, bestMoveChance: 0.72 },
      endgame: { depth: 14, bestMoveChance: 0.97 }
    },
    personality: { aggression: 10, trapSeeking: 15, defensiveness: 85 },
    mateConversionChance: 0.99,
    diagnosisCodes: [],
    bookPlies: 8,
    bookMistakeChance: 0.15
  },
  {
    id: 'chloe-bennett',
    name: 'Chloe Bennett',
    avatarIndex: 8,
    description: '"The Inventor." Finds unusual plans and surprising sacrifices instead of the obvious move.',
    elo: 620,
    phases: {
      opening: { depth: 7, bestMoveChance: 0.38 },
      middlegame: { depth: 7, bestMoveChance: 0.23 },
      endgame: { depth: 13, bestMoveChance: 0.48 }
    },
    personality: { aggression: 55, trapSeeking: 50, defensiveness: 20 },
    mateConversionChance: 0.63,
    diagnosisCodes: ['TA-07', 'TA-18'], // seeks the unusual plan over the obvious one — sometimes that obvious move was the correct tactic
    bookPlies: 3,
    bookMistakeChance: 0.3
  },
  {
    id: 'calvin-park',
    name: 'Calvin Park',
    avatarIndex: 9,
    description: '"The Calculator." Calculates deeply and precisely, one line at a time.',
    elo: 700,
    phases: {
      opening: { depth: 9, bestMoveChance: 0.94 },
      middlegame: { depth: 9, bestMoveChance: 0.79 },
      endgame: { depth: 15, bestMoveChance: 0.98 }
    },
    personality: { aggression: 35, trapSeeking: 45, defensiveness: 40 },
    mateConversionChance: 0.99,
    diagnosisCodes: ['TA-19'], // "one line at a time" — deep in a single calculated line, occasionally misses a tactical resource elsewhere on the board
    bookPlies: 6,
    bookMistakeChance: 0.15
  },
  {
    id: 'diana-moretti',
    name: 'Diana Moretti',
    avatarIndex: 10,
    description: '"The Chameleon." Switches easily between aggressive and positional play mid-game.',
    elo: 680,
    phases: {
      opening: { depth: 8, bestMoveChance: 0.45 },
      middlegame: { depth: 8, bestMoveChance: 0.3 },
      endgame: { depth: 14, bestMoveChance: 0.55 }
    },
    personality: { aggression: 50, trapSeeking: 35, defensiveness: 35 },
    mateConversionChance: 0.7,
    diagnosisCodes: ['TA-16'], // switches styles mid-game; a discovered attack (noticing a move unlocks another piece) is easy to miss between modes
    bookPlies: 5,
    bookMistakeChance: 0.2
  },
  {
    id: 'paul-mensah',
    name: 'Paul Mensah',
    avatarIndex: 11,
    description: '"The Architect." Improves his position slowly and values structure over tactics.',
    elo: 750,
    phases: {
      opening: { depth: 8, bestMoveChance: 0.87 },
      middlegame: { depth: 8, bestMoveChance: 0.72 },
      endgame: { depth: 14, bestMoveChance: 0.97 }
    },
    personality: { aggression: 15, trapSeeking: 10, defensiveness: 75 },
    mateConversionChance: 0.99,
    diagnosisCodes: ['TA-07', 'TA-18', 'TA-43'],
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
    phases: {
      opening: { depth: 10, bestMoveChance: 0.73 },
      middlegame: { depth: 10, bestMoveChance: 0.58 },
      endgame: { depth: 16, bestMoveChance: 0.83 }
    },
    personality: { aggression: 65, trapSeeking: 90, defensiveness: 20 },
    mateConversionChance: 0.98,
    diagnosisCodes: ['TA-12'], // highest trapSeeking in the roster — already excellent at forks; the one gap left is the subtler pin variant
    bookPlies: 8,
    bookMistakeChance: 0.12
  },
  {
    id: 'ella-fischer',
    name: 'Ella Fischer',
    avatarIndex: 13,
    description: '"The Finisher." Trades patiently, neutralizes danger, and converts small edges accurately.',
    elo: 1100,
    phases: {
      opening: { depth: 11, bestMoveChance: 0.94 },
      middlegame: { depth: 11, bestMoveChance: 0.79 },
      endgame: { depth: 17, bestMoveChance: 0.98 }
    },
    personality: { aggression: 20, trapSeeking: 25, defensiveness: 70 },
    mateConversionChance: 0.99,
    diagnosisCodes: [],
    bookPlies: 10,
    bookMistakeChance: 0.08
  },
  {
    id: 'raj-patel',
    name: 'Raj Patel',
    avatarIndex: 14,
    description: '"The Survivor." Defends resourcefully, sets practical problems, and refuses to resign early.',
    elo: 1000,
    phases: {
      opening: { depth: 10, bestMoveChance: 0.66 },
      middlegame: { depth: 10, bestMoveChance: 0.51 },
      endgame: { depth: 16, bestMoveChance: 0.76 }
    },
    personality: { aggression: 25, trapSeeking: 45, defensiveness: 75 },
    mateConversionChance: 0.91,
    diagnosisCodes: ['TA-18'],
    bookPlies: 6,
    bookMistakeChance: 0.15
  },
  {
    id: 'fiona-reyes',
    name: 'Fiona Reyes',
    avatarIndex: 15,
    description: '"The Fearless." Welcomes complications and accepts sacrifices with total confidence.',
    elo: 1150,
    phases: {
      opening: { depth: 10, bestMoveChance: 0.59 },
      middlegame: { depth: 10, bestMoveChance: 0.44 },
      endgame: { depth: 16, bestMoveChance: 0.69 }
    },
    personality: { aggression: 75, trapSeeking: 60, defensiveness: 15 },
    mateConversionChance: 0.84,
    diagnosisCodes: ['TA-04', 'TA-17'], // welcomes chaos she doesn't fully control — neglects her own back rank and the double-check that complications can produce
    bookPlies: 7,
    bookMistakeChance: 0.15
  },
  {
    id: 'ethan-cole',
    name: 'Ethan Cole',
    avatarIndex: 16,
    description: '"The Veteran." Leans on decades of experience, avoiding unnecessary calculation.',
    elo: 1250,
    phases: {
      opening: { depth: 11, bestMoveChance: 0.87 },
      middlegame: { depth: 11, bestMoveChance: 0.72 },
      endgame: { depth: 17, bestMoveChance: 0.97 }
    },
    personality: { aggression: 35, trapSeeking: 30, defensiveness: 55 },
    mateConversionChance: 0.99,
    diagnosisCodes: ['TA-19', 'TA-14'], // "avoiding unnecessary calculation" — skips the precise reading these two patterns require
    bookPlies: 14,
    bookMistakeChance: 0.06
  },
  {
    id: 'ruby-tanaka',
    name: 'Ruby Tanaka',
    avatarIndex: 17,
    description: '"The Rising Star." Plays ambitious, energetic chess backed by strong preparation.',
    elo: 1300,
    phases: {
      opening: { depth: 11, bestMoveChance: 0.73 },
      middlegame: { depth: 11, bestMoveChance: 0.58 },
      endgame: { depth: 17, bestMoveChance: 0.83 }
    },
    personality: { aggression: 60, trapSeeking: 50, defensiveness: 30 },
    mateConversionChance: 0.98,
    diagnosisCodes: ['TA-11'], // energetic and well-prepared, but a static absolute pin isn't the kind of pattern preparation catches
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
    phases: {
      opening: { depth: 12, bestMoveChance: 0.94 },
      middlegame: { depth: 12, bestMoveChance: 0.79 },
      endgame: { depth: 18, bestMoveChance: 0.98 }
    },
    personality: { aggression: 30, trapSeeking: 30, defensiveness: 70 },
    mateConversionChance: 0.99,
    diagnosisCodes: ['TA-19'], // grinds for the long game — a sudden overload tactic isn't what patient pressure is tuned to notice
    bookPlies: 12,
    bookMistakeChance: 0.06
  },
  {
    id: 'maya-das',
    name: 'Maya Das',
    avatarIndex: 19,
    description: '"The Queen Hunter." Gains tempo through threats and hunts your loose or exposed pieces.',
    elo: 1600,
    phases: {
      opening: { depth: 12, bestMoveChance: 0.8 },
      middlegame: { depth: 12, bestMoveChance: 0.65 },
      endgame: { depth: 18, bestMoveChance: 0.9 }
    },
    personality: { aggression: 70, trapSeeking: 75, defensiveness: 20 },
    mateConversionChance: 0.99,
    diagnosisCodes: ['TA-26'], // hunts loose pieces generally, but a fully trapped piece (the more advanced version of that pattern) is a specific gap
    bookPlies: 10,
    bookMistakeChance: 0.08
  },
  {
    id: 'marco-silva',
    name: 'Marco Silva',
    avatarIndex: 20,
    description: '"The Marathoner." Calculates steadily and stays accurate deep into long games.',
    elo: 1700,
    phases: {
      opening: { depth: 13, bestMoveChance: 0.97 },
      middlegame: { depth: 13, bestMoveChance: 0.83 },
      endgame: { depth: 19, bestMoveChance: 0.98 }
    },
    personality: { aggression: 35, trapSeeking: 35, defensiveness: 55 },
    mateConversionChance: 0.99,
    diagnosisCodes: [],
    bookPlies: 12,
    bookMistakeChance: 0.05
  },
  {
    id: 'leo-haddad',
    name: 'Leo Haddad',
    avatarIndex: 21,
    description: '"The Improviser." Steps off known theory early, trusting intuition over preparation.',
    elo: 1500,
    phases: {
      opening: { depth: 11, bestMoveChance: 0.45 },
      middlegame: { depth: 11, bestMoveChance: 0.3 },
      endgame: { depth: 17, bestMoveChance: 0.55 }
    },
    personality: { aggression: 55, trapSeeking: 55, defensiveness: 25 },
    mateConversionChance: 0.7,
    diagnosisCodes: ['TA-18'],
    bookPlies: 3,
    bookMistakeChance: 0.4
  },
  {
    id: 'viktor-hahn',
    name: 'Viktor Hahn',
    avatarIndex: 22,
    description: '"The Iron Wall." Eliminates weaknesses, absorbs attacks, and frustrates aggressive opponents.',
    elo: 1750,
    phases: {
      opening: { depth: 13, bestMoveChance: 0.97 },
      middlegame: { depth: 13, bestMoveChance: 0.83 },
      endgame: { depth: 19, bestMoveChance: 0.98 }
    },
    personality: { aggression: 10, trapSeeking: 20, defensiveness: 90 },
    mateConversionChance: 0.99,
    diagnosisCodes: [],
    bookPlies: 14,
    bookMistakeChance: 0.04
  },
  {
    id: 'arun-kapoor',
    name: 'Arun Kapoor',
    avatarIndex: 23,
    description: '"The Sniper." Waits quietly for one weakness, then finishes with a short forcing sequence.',
    elo: 1650,
    phases: {
      opening: { depth: 12, bestMoveChance: 0.94 },
      middlegame: { depth: 12, bestMoveChance: 0.79 },
      endgame: { depth: 18, bestMoveChance: 0.98 }
    },
    personality: { aggression: 45, trapSeeking: 80, defensiveness: 45 },
    mateConversionChance: 0.99,
    diagnosisCodes: ['TA-12'], // precise and tactically sharp; the one gap is the subtler pin variant, distinct from his signature forcing finishes
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
    phases: {
      opening: { depth: 14, bestMoveChance: 0.8 },
      middlegame: { depth: 14, bestMoveChance: 0.65 },
      endgame: { depth: 20, bestMoveChance: 0.9 }
    },
    personality: { aggression: 55, trapSeeking: 80, defensiveness: 30 },
    mateConversionChance: 0.99,
    diagnosisCodes: ['TA-09'], // sets practical traps under pressure, but the king fork specifically escapes the pattern she leans on
    bookPlies: 12,
    bookMistakeChance: 0.05
  },
  {
    id: 'elias-grant',
    name: 'Professor Elias Grant',
    avatarIndex: 25,
    description: '"The Theorist." Deep opening knowledge and classical principles, applied with total discipline.',
    elo: 2200,
    phases: {
      opening: { depth: 14, bestMoveChance: 0.97 },
      middlegame: { depth: 14, bestMoveChance: 0.86 },
      endgame: { depth: 20, bestMoveChance: 0.98 }
    },
    personality: { aggression: 30, trapSeeking: 30, defensiveness: 55 },
    mateConversionChance: 0.99,
    diagnosisCodes: [],
    bookPlies: 20,
    bookMistakeChance: 0.02
  },
  {
    id: 'william-hart',
    name: 'William Hart',
    avatarIndex: 26,
    description: '"The Wildcard." Chooses sharp sidelines that force you to think for yourself early.',
    elo: 2050,
    phases: {
      opening: { depth: 14, bestMoveChance: 0.66 },
      middlegame: { depth: 14, bestMoveChance: 0.51 },
      endgame: { depth: 20, bestMoveChance: 0.76 }
    },
    personality: { aggression: 60, trapSeeking: 55, defensiveness: 25 },
    mateConversionChance: 0.91,
    diagnosisCodes: ['TA-16'], // sharp, chaotic sidelines create the kind of position where a quieter discovered attack goes unnoticed
    bookPlies: 10,
    bookMistakeChance: 0.08
  },
  {
    id: 'yuna-seo',
    name: 'Yuna Seo',
    avatarIndex: 27,
    description: '"The Ice Queen." Controlled, clinical chess that snuffs out counterplay before converting.',
    elo: 2300,
    phases: {
      opening: { depth: 15, bestMoveChance: 0.97 },
      middlegame: { depth: 15, bestMoveChance: 0.89 },
      endgame: { depth: 21, bestMoveChance: 0.98 }
    },
    personality: { aggression: 25, trapSeeking: 35, defensiveness: 75 },
    mateConversionChance: 0.99,
    diagnosisCodes: [],
    bookPlies: 16,
    bookMistakeChance: 0.02
  },
  {
    id: 'mateo-cruz',
    name: 'Mateo Cruz',
    avatarIndex: 28,
    description: '"The Comeback Kid." Builds resilient defenses and turns dangerous the moment you relax.',
    elo: 1950,
    phases: {
      opening: { depth: 13, bestMoveChance: 0.73 },
      middlegame: { depth: 13, bestMoveChance: 0.58 },
      endgame: { depth: 19, bestMoveChance: 0.83 }
    },
    personality: { aggression: 45, trapSeeking: 55, defensiveness: 60 },
    mateConversionChance: 0.98,
    diagnosisCodes: ['TA-19'], // resilient and balanced, but the sudden-overload pattern isn't what a defense-to-offense mindset is tuned to catch
    bookPlies: 10,
    bookMistakeChance: 0.1
  },
  {
    id: 'adrian-laurent',
    name: 'Adrian Laurent',
    avatarIndex: 29,
    description: '"The Artist." Favors harmonious attacks and elegant sacrifices over the merely correct move.',
    elo: 2150,
    phases: {
      opening: { depth: 14, bestMoveChance: 0.73 },
      middlegame: { depth: 14, bestMoveChance: 0.58 },
      endgame: { depth: 20, bestMoveChance: 0.83 }
    },
    personality: { aggression: 70, trapSeeking: 70, defensiveness: 20 },
    mateConversionChance: 0.98,
    diagnosisCodes: ['TA-10', 'TA-18'], // prefers the elegant move to the merely correct one — the plain sliding-piece fork and defender-removal shot are exactly the "merely correct" moves he'd rather not play
    bookPlies: 10,
    bookMistakeChance: 0.06
  }
] as const;

export function findBotConfig(id: string): BotConfig | undefined {
  return BOT_ROSTER.find((bot) => bot.id === id);
}
