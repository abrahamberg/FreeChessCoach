import { CONFIG } from '../config.js';

/** One game's contribution to a code's `O`/`E` count — the cluster unit
 * §4.6 asks for ("game-clustered", not opportunity-independent). */
export interface GameOpportunities {
  gameId: string;
  /** `O` for this game — opportunities this code could have fired on. */
  opportunities: number;
  /** `E` for this game — how many of those opportunities failed. */
  failures: number;
}

export interface BetaBinomialInput {
  games: readonly GameOpportunities[];
  /** The diagnosis code's `ratingPrior` tuple (§0.1's "Primary CR prior"
   * band), used only to shape the Beta prior's mean — never to gate. */
  ratingPrior: readonly [number, number];
  /** The student's current rating for this time control, positioning them
   * inside/outside the code's rating band. */
  studentRating: number;
}

export interface BetaBinomialResult {
  /** Posterior mean failure rate in `[0, 1]`. */
  posteriorMean: number;
  /** `[lower, upper]` credible interval (normal approximation to the
   * posterior Beta, per `CONFIG.betaBinomial.ciZ`), clamped to `[0, 1]`. */
  credibleInterval: [number, number];
  alpha: number;
  beta: number;
  /** Method-of-moments intraclass correlation estimate in `[0, 1]` — how
   * much of the variation across games is between-game rather than
   * within-game. 0 means the games behaved like one pooled binomial
   * sample; 1 means each game's outcomes were fully tied together. */
  overdispersion: number;
  /** Raw opportunity count deflated by clustering (`overdispersion`) —
   * what the posterior actually treats as independent evidence. Always
   * `<= totalOpportunities` and `>= 0`. */
  effectiveOpportunities: number;
}

/**
 * §0.1: the rating band is "the interval in which this issue is most
 * likely to be a primary, high-value coaching diagnosis" — not a
 * population base rate. Read as a prior mean: at the band's midpoint the
 * issue is exactly as likely to be live as resolved (0.5); a student well
 * below the band probably hasn't outgrown it yet (mean pulled up); a
 * student well above it probably has (mean pulled down). `z` is the
 * student's distance from the midpoint in half-band-widths, so it reaches
 * +-1 exactly at the band's own edges and keeps growing beyond them.
 */
function ratingPriorMean(ratingPrior: readonly [number, number], studentRating: number): number {
  const { priorMeanSlope, priorMeanFloor, priorMeanCeil } = CONFIG.betaBinomial;
  const [lower, upper] = ratingPrior;
  const mid = (lower + upper) / 2;
  const half = Math.max(1, (upper - lower) / 2);
  const z = (studentRating - mid) / half;
  const mean = 0.5 - priorMeanSlope * z;
  return Math.min(priorMeanCeil, Math.max(priorMeanFloor, mean));
}

/**
 * Method-of-moments (ANOVA / Kleinman) estimator for the intraclass
 * correlation of binary outcomes clustered by game. Undefined with a
 * single cluster (no between-game variance to compare against) — a lone
 * game is conservatively treated as fully correlated (`1`), since one
 * sample gives no evidence that a repeat would look any different.
 */
function estimateOverdispersion(games: readonly GameOpportunities[]): number {
  const clusters = games.filter((game) => game.opportunities > 0);
  const k = clusters.length;
  if (k <= 1) return k === 1 ? 1 : 0;

  const totalN = clusters.reduce((sum, game) => sum + game.opportunities, 0);
  const totalX = clusters.reduce((sum, game) => sum + game.failures, 0);
  const pBar = totalX / totalN;

  const msb = clusters.reduce((sum, game) => {
    const p = game.failures / game.opportunities;
    return sum + game.opportunities * (p - pBar) ** 2;
  }, 0) / (k - 1);

  const msw = clusters.reduce((sum, game) => {
    const p = game.failures / game.opportunities;
    return sum + game.opportunities * p * (1 - p);
  }, 0) / Math.max(1, totalN - k);

  const sumNSquared = clusters.reduce((sum, game) => sum + game.opportunities ** 2, 0);
  const n0 = (totalN - sumNSquared / totalN) / (k - 1);

  const denominator = msb + (n0 - 1) * msw;
  if (denominator <= 0) return 0;

  const rho = (msb - msw) / denominator;
  return Math.min(1, Math.max(0, rho));
}

/**
 * §4.6: "an automated implementation should eventually use a
 * game-clustered beta-binomial or comparable model rather than treating
 * every opportunity as independent." Pools every game's `O`/`E`, deflates
 * them by the estimated clustering (`overdispersion`) so a run of failures
 * confined to one game counts as much weaker evidence than the same count
 * spread across several, then combines the result with a rating-shaped
 * Beta prior. Zero total opportunities falls straight through to the
 * prior (`effectiveOpportunities: 0`), never `NaN`.
 */
export function computeBetaBinomial(input: BetaBinomialInput): BetaBinomialResult {
  const { priorStrength, ciZ } = CONFIG.betaBinomial;
  const priorMean = ratingPriorMean(input.ratingPrior, input.studentRating);
  const alpha0 = priorMean * priorStrength;
  const beta0 = (1 - priorMean) * priorStrength;

  const totalOpportunities = input.games.reduce((sum, game) => sum + game.opportunities, 0);
  const totalFailures = input.games.reduce((sum, game) => sum + game.failures, 0);

  let effectiveOpportunities = 0;
  let overdispersion = 0;

  if (totalOpportunities > 0) {
    overdispersion = estimateOverdispersion(input.games);
    const k = input.games.filter((game) => game.opportunities > 0).length;
    const meanClusterSize = totalOpportunities / k;
    const designEffect = 1 + (meanClusterSize - 1) * overdispersion;
    effectiveOpportunities = Math.min(totalOpportunities, Math.max(k, totalOpportunities / designEffect));
  }

  const pBar = totalOpportunities > 0 ? totalFailures / totalOpportunities : 0;
  const effectiveFailures = pBar * effectiveOpportunities;

  const alpha = alpha0 + effectiveFailures;
  const beta = beta0 + (effectiveOpportunities - effectiveFailures);

  const posteriorMean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const sd = Math.sqrt(variance);

  const credibleInterval: [number, number] = [
    Math.min(1, Math.max(0, posteriorMean - ciZ * sd)),
    Math.min(1, Math.max(0, posteriorMean + ciZ * sd))
  ];

  return { posteriorMean, credibleInterval, alpha, beta, overdispersion, effectiveOpportunities };
}
