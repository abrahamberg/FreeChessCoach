/** Seeded randomness for the marketing demo data: the same seed always
 * produces the same "player", so a screenshot can be re-taken identically. */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller; `1 - rng()` keeps the log argument above zero. */
export function gaussian(rng: Rng, mean: number, standardDeviation: number): number {
  const radius = Math.sqrt(-2 * Math.log(1 - rng()));
  return mean + standardDeviation * radius * Math.cos(2 * Math.PI * rng());
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

export interface Weighted<T> {
  item: T;
  weight: number;
}

export function pickWeighted<T>(rng: Rng, options: readonly Weighted<T>[]): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = rng() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option.item;
  }
  return (options[options.length - 1] as Weighted<T>).item;
}
