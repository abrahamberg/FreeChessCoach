const ACCURACY_SCALE = 103.1668;
const ACCURACY_DECAY = 0.04354;
const ACCURACY_OFFSET = 3.1669;

/** Converts a mover's win-percentage drop into a 0-to-100 move accuracy. */
export function moveAccuracy(drop: number): number {
  const rawAccuracy = ACCURACY_SCALE * Math.exp(-ACCURACY_DECAY * drop) - ACCURACY_OFFSET;
  return clamp(rawAccuracy, 0, 100);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
