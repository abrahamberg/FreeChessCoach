export type BotTierId = 'beginner' | 'developing' | 'intermediate' | 'advanced' | 'expert';

export interface BotTier {
  id: BotTierId;
  label: string;
  maxElo: number;
}

/** Elo thresholds match the gaps between BOT_ROSTER's five tiers (beginner
 * tops out at 500, developing at 750, intermediate at 1300, advanced at
 * 1750 — see packages/shared/src/bot-roster.ts's tier comment blocks), so a
 * bot's tier is derived from its elo rather than duplicated as its own
 * field on BotConfig. */
export const BOT_TIERS: readonly BotTier[] = [
  { id: 'beginner', label: 'Beginner', maxElo: 550 },
  { id: 'developing', label: 'Developing', maxElo: 800 },
  { id: 'intermediate', label: 'Intermediate', maxElo: 1400 },
  { id: 'advanced', label: 'Advanced', maxElo: 1900 },
  { id: 'expert', label: 'Expert', maxElo: Infinity }
];

const FALLBACK_TIER = BOT_TIERS[BOT_TIERS.length - 1] as BotTier;

export function tierForElo(elo: number): BotTierId {
  return (BOT_TIERS.find((tier) => elo <= tier.maxElo) ?? FALLBACK_TIER).id;
}
