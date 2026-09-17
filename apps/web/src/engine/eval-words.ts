/** Word-based eval phrasing shared by every engine readout that deliberately
 * never shows a raw number — the JIT bot-play hint panel (browser-engine cp,
 * mover-relative) and the Explore panel's engine-pipeline feedback (server
 * cp, already white-perspective — callers pass sideToMove='w' unchanged).
 * `sideToMove` says how to read the `cp`/`mateIn` given: mover-relative
 * input un-flips through the real side to move; already-white-perspective
 * input passes 'w' so no flip happens. */
export function cpToWords(cp: number, sideToMove: 'w' | 'b'): string {
  const whiteCp = sideToMove === 'w' ? cp : -cp;
  const abs = Math.abs(whiteCp);
  const side = whiteCp >= 0 ? 'White' : 'Black';
  if (abs < 50) return 'The position is roughly equal';
  if (abs < 150) return `${side} is slightly better`;
  if (abs < 400) return `${side} is better`;
  if (abs < 900) return `${side} is much better`;
  return `${side} is winning`;
}

export function mateToWords(mateIn: number, sideToMove: 'w' | 'b'): string {
  const whiteMateIn = sideToMove === 'w' ? mateIn : -mateIn;
  const side = whiteMateIn > 0 ? 'White' : 'Black';
  return `${side} has a forced mate in ${Math.abs(whiteMateIn)}`;
}
