/** Word-based eval phrasing shared by every engine readout that deliberately
 * never shows a raw number — the JIT bot-play hint panel (browser-engine cp,
 * mover-relative) and the Explore panel's engine-pipeline feedback (server
 * cp, already white-perspective — callers pass sideToMove='w' unchanged).
 * `sideToMove` says how to read the `cp`/`mateIn` given: mover-relative
 * input un-flips through the real side to move; already-white-perspective
 * input passes 'w' so no flip happens. */
export function cpToWords(cp: number, sideToMove: 'w' | 'b'): string {
  const whiteCp = sideToMove === 'w' ? cp : -cp;
  const band = cpBand(whiteCp);
  if (band === null) return 'The position is roughly equal';
  return `${whiteCp >= 0 ? 'White' : 'Black'} is ${band}`;
}

/** How far ahead the side with the edge is, in words; null when it is level. */
export function cpBand(cp: number): 'slightly better' | 'better' | 'much better' | 'winning' | null {
  const abs = Math.abs(cp);
  if (abs < 50) return null;
  if (abs < 150) return 'slightly better';
  if (abs < 400) return 'better';
  if (abs < 900) return 'much better';
  return 'winning';
}

export function mateToWords(mateIn: number, sideToMove: 'w' | 'b'): string {
  const whiteMateIn = sideToMove === 'w' ? mateIn : -mateIn;
  const side = whiteMateIn > 0 ? 'White' : 'Black';
  return `${side} has a forced mate in ${Math.abs(whiteMateIn)}`;
}
