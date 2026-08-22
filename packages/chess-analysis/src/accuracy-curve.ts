import { CONFIG } from './config.js';

const { scale: ACCURACY_SCALE, decay: ACCURACY_DECAY, offset: ACCURACY_OFFSET } = CONFIG.accuracyCurve;

/** Converts a mover's win-percentage drop into a 0-to-100 move accuracy. */
export function moveAccuracy(drop: number): number {
  const rawAccuracy = ACCURACY_SCALE * Math.exp(-ACCURACY_DECAY * drop) - ACCURACY_OFFSET;
  return clamp(rawAccuracy, 0, 100);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
