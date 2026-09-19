import { clamp, gaussian, type Rng } from './rng.js';

/** The demo player's journey: 450 → 2130 in one year, following how real
 * improvement feels — very fast at first (the basics are cheap), slower through
 * the middle, then a long grind where two months can pass for +150 points. The
 * anchors below carry a plateau and a small setback on purpose; a curve without
 * them reads as fake. */
export const YEAR_DAYS = 365;

const ANCHORS: readonly (readonly [day: number, rating: number])[] = [
  [0, 450],
  [12, 590],
  [25, 730],
  [40, 870],
  [60, 1000],
  [75, 1085],
  [90, 1180],
  [110, 1300],
  [118, 1290],
  [135, 1440],
  [158, 1600],
  [190, 1700],
  [215, 1745],
  [235, 1752],
  [260, 1840],
  [300, 1955],
  [335, 2050],
  [YEAR_DAYS - 1, 2130]
];

/** Monotone cubic (Fritsch–Carlson) tangents, so the curve never overshoots an anchor. */
function tangents(): number[] {
  const slopes = ANCHORS.slice(1).map(([day, rating], i) => {
    const [previousDay, previousRating] = ANCHORS[i] as readonly [number, number];
    return (rating - previousRating) / (day - previousDay);
  });
  const result = ANCHORS.map((_, i) => {
    if (i === 0) return slopes[0] as number;
    if (i === ANCHORS.length - 1) return slopes[slopes.length - 1] as number;
    const before = slopes[i - 1] as number;
    const after = slopes[i] as number;
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  slopes.forEach((slope, i) => {
    if (slope === 0) {
      result[i] = 0;
      result[i + 1] = 0;
      return;
    }
    const a = (result[i] as number) / slope;
    const b = (result[i + 1] as number) / slope;
    const magnitude = Math.hypot(a, b);
    if (magnitude > 3) {
      result[i] = ((3 * a) / magnitude) * slope;
      result[i + 1] = ((3 * b) / magnitude) * slope;
    }
  });
  return result;
}

const TANGENTS = tangents();

/** The player's true strength on `day` (0 = a year ago, 364 = today). */
export function trueRatingOnDay(day: number): number {
  const t = clamp(day, 0, YEAR_DAYS - 1);
  const segment = Math.min(ANCHORS.length - 2, ANCHORS.findIndex(([anchorDay]) => anchorDay > t) - 1);
  const index = segment < 0 ? ANCHORS.length - 2 : segment;
  const [d0, r0] = ANCHORS[index] as readonly [number, number];
  const [d1, r1] = ANCHORS[index + 1] as readonly [number, number];
  const span = d1 - d0;
  const s = (t - d0) / span;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  const value = h00 * r0 + h10 * span * (TANGENTS[index] as number) + h01 * r1 + h11 * span * (TANGENTS[index + 1] as number);
  return Math.round(value);
}

/** Rating points per day between two days — the test's "how fast is this stage". */
export function averageSlope(fromDay: number, toDay: number): number {
  return (trueRatingOnDay(toDay) - trueRatingOnDay(fromDay)) / (toDay - fromDay);
}

/** One game's *estimated* rating: a single game is a noisy reading of the
 * player's strength, and the noise grows a little with strength (stronger
 * opponents, more complicated games). */
export function estimatedRatingOnDay(rng: Rng, day: number): number {
  const strength = trueRatingOnDay(day);
  const noise = 55 + strength * 0.022;
  return Math.round(clamp(gaussian(rng, strength, noise), 150, 2500));
}
