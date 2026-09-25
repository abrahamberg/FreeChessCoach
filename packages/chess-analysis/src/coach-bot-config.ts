import { BOT_ROSTER, type BotConfig } from '@freechesscoach/shared';

/** What this move's decision forces on top of the level's ordinary odds. */
export interface CoachMoveOverrides {
  /** Punish the student's last move: the engine's best move. */
  forceBest: boolean;
  /** A deliberate mistake is not allowed this move (the cooldown). */
  noMistake: boolean;
}

const NEUTRAL_PERSONALITY = { aggression: 50, trapSeeking: 50, defensiveness: 50 } as const;

/**
 * A bot config playing at `elo`, so the coach's move can be picked by the
 * same selector the bots use (`selectBotMove`): every odds knob interpolated
 * between the two roster bots either side of `elo`, a neutral personality,
 * and no documented weaknesses of its own. `overrides` then pin the branch
 * the move must come from.
 */
export function coachBotConfig(elo: number, overrides: CoachMoveOverrides): BotConfig {
  const [lower, upper, t] = bracket(elo);
  const mix = (pick: (bot: BotConfig) => number): number => pick(lower) + t * (pick(upper) - pick(lower));
  const config: BotConfig = {
    id: 'coach',
    name: 'Coach',
    avatarIndex: 0,
    description: 'The coach, playing at the student\'s level.',
    elo: Math.round(mix((bot) => bot.elo)),
    topFiveChance: mix((bot) => bot.topFiveChance),
    bestMoveGivenTopFiveChance: mix((bot) => bot.bestMoveGivenTopFiveChance),
    blunderGivenMissChance: mix((bot) => bot.blunderGivenMissChance),
    mateConversionChance: mix((bot) => bot.mateConversionChance),
    personality: { ...NEUTRAL_PERSONALITY },
    diagnosisCodes: [],
    bookPlies: Math.round(mix((bot) => bot.bookPlies)),
    bookMistakeChance: mix((bot) => bot.bookMistakeChance)
  };
  return applyOverrides(config, overrides);
}

function applyOverrides(config: BotConfig, overrides: CoachMoveOverrides): BotConfig {
  if (overrides.forceBest) return { ...config, topFiveChance: 1, bestMoveGivenTopFiveChance: 1, mateConversionChance: 1 };
  if (overrides.noMistake) return { ...config, topFiveChance: 1 };
  return config;
}

const ROSTER_BY_ELO: readonly BotConfig[] = [...BOT_ROSTER].sort((a, b) => a.elo - b.elo);

/** The roster bots either side of `elo` and how far between them it is. */
function bracket(elo: number): [BotConfig, BotConfig, number] {
  const first = ROSTER_BY_ELO[0];
  const last = ROSTER_BY_ELO[ROSTER_BY_ELO.length - 1];
  if (!first || !last) throw new Error('bot roster is empty');
  if (elo <= first.elo) return [first, first, 0];
  if (elo >= last.elo) return [last, last, 0];

  const upperIndex = ROSTER_BY_ELO.findIndex((bot) => bot.elo >= elo);
  const upper = ROSTER_BY_ELO[upperIndex] ?? last;
  const lower = ROSTER_BY_ELO[upperIndex - 1] ?? first;
  if (upper.elo === lower.elo) return [lower, upper, 0];
  return [lower, upper, (elo - lower.elo) / (upper.elo - lower.elo)];
}
