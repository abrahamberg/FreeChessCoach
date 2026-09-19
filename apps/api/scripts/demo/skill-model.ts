import { TACTIC_MOTIF_TYPES, type TacticMotifCounts, type TacticMotifType } from '@freechesscoach/shared';
import { clamp, type Rng } from './rng.js';

/** How a player of a given rating plays: the one place the demo data decides
 * what "450" and "2130" look like, so every chart on the Stats page agrees. */

/** Average accuracy: 50% for a raw beginner, climbing steeply and then flattening. */
export function accuracyAt(rating: number): number {
  return 50 + 40 * (1 - Math.exp(-(rating - 450) / 900));
}

/** Fraction of the journey covered (0 at 450, 1 at 2130). */
function progressAt(rating: number): number {
  return clamp((rating - 450) / (2130 - 450), 0, 1);
}

/** Strategy sub-scores relative to overall accuracy. The demo player attacks
 * well and defends badly at first — an interesting, uneven profile — and the
 * defending gap closes as the year goes on. */
export function strategyOffsets(rating: number): Record<'pawnStructure' | 'spaceAdvantage' | 'activePiece' | 'attacking' | 'defending', number> {
  const progress = progressAt(rating);
  return {
    pawnStructure: -4 + 3 * progress,
    spaceAdvantage: -3 + 2 * progress,
    activePiece: 2 + 2 * progress,
    attacking: 8 - 2 * progress,
    defending: -12 + 8 * progress
  };
}

/** Phase accuracy relative to overall: book knowledge lifts the opening, and
 * the endgame is the phase that takes longest to learn. */
export function phaseOffsets(rating: number): { opening: number; middlegame: number; endgame: number } {
  const progress = progressAt(rating);
  return { opening: 5 - 2 * progress, middlegame: -3, endgame: -9 + 6 * progress };
}

export interface EndgameThemeProfile {
  theme: 'kingAndPawn' | 'queen' | 'rookAndPawn' | 'other';
  weight: number;
  /** Accuracy points above/below the player's endgame average. */
  skill: number;
}

/** Rook endings are the most common and the weakest — a real, coachable finding. */
export const ENDGAME_THEME_PROFILE: readonly EndgameThemeProfile[] = [
  { theme: 'rookAndPawn', weight: 40, skill: -8 },
  { theme: 'kingAndPawn', weight: 26, skill: 5 },
  { theme: 'queen', weight: 14, skill: -3 },
  { theme: 'other', weight: 20, skill: 1 }
];

interface TacticProfile {
  /** Expected chances per game to play this tactic. */
  frequency: number;
  /** Rating at which the player finds it half the time. */
  difficulty: number;
  /** Expected chances per game to stop the opponent's version. */
  threatFrequency: number;
  /** Rating at which the player defuses the opponent's version half the time. */
  threatDifficulty: number;
}

const TACTIC_PROFILES: Partial<Record<TacticMotifType, TacticProfile>> = {
  freePiece: { frequency: 0.7, difficulty: 550, threatFrequency: 0.6, threatDifficulty: 700 },
  checkmate: { frequency: 0.16, difficulty: 850, threatFrequency: 0.12, threatDifficulty: 1000 },
  fork: { frequency: 0.5, difficulty: 1150, threatFrequency: 0.42, threatDifficulty: 1300 },
  pin: { frequency: 0.36, difficulty: 1300, threatFrequency: 0.3, threatDifficulty: 1450 },
  weakBackRank: { frequency: 0.13, difficulty: 1350, threatFrequency: 0.14, threatDifficulty: 1500 },
  discoveredAttack: { frequency: 0.2, difficulty: 1450, threatFrequency: 0.14, threatDifficulty: 1600 },
  trappedPiece: { frequency: 0.12, difficulty: 1500, threatFrequency: 0.1, threatDifficulty: 1650 },
  removesDefender: { frequency: 0.11, difficulty: 1520, threatFrequency: 0.09, threatDifficulty: 1700 },
  overloadedDefender: { frequency: 0.1, difficulty: 1620, threatFrequency: 0.07, threatDifficulty: 1800 },
  skewer: { frequency: 0.08, difficulty: 1750, threatFrequency: 0.05, threatDifficulty: 1900 },
  doubleCheck: { frequency: 0.03, difficulty: 1550, threatFrequency: 0.02, threatDifficulty: 1750 }
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Knuth's Poisson sampler — fine for the small means used here. */
function poisson(rng: Rng, mean: number): number {
  const limit = Math.exp(-mean);
  let count = 0;
  let product = rng();
  while (product > limit) {
    count += 1;
    product *= rng();
  }
  return count;
}

function binomial(rng: Rng, trials: number, probability: number): number {
  let successes = 0;
  for (let i = 0; i < trials; i++) if (rng() < probability) successes += 1;
  return successes;
}

/** One game's tactic tallies, both directions: chances the player had
 * (opportunities/found) and threats the opponent had (preventable/prevented). */
export function tacticCountsForGame(rng: Rng, rating: number): TacticMotifCounts {
  const richness = 0.8 + 0.4 * progressAt(rating);
  const counts = Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0, preventable: 0, prevented: 0 }])) as TacticMotifCounts;
  for (const [type, profile] of Object.entries(TACTIC_PROFILES) as [TacticMotifType, TacticProfile][]) {
    const opportunities = poisson(rng, profile.frequency * richness);
    const preventable = poisson(rng, profile.threatFrequency * richness);
    counts[type] = {
      opportunities,
      found: binomial(rng, opportunities, sigmoid((rating - profile.difficulty) / 260)),
      preventable,
      prevented: binomial(rng, preventable, sigmoid((rating - profile.threatDifficulty) / 260))
    };
  }
  return counts;
}
