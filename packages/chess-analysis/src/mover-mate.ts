/** Moves to mate for `side` on an engine line (White's view: positive is
 * White mating); null when it does not mate. */
export function moverMateIn(line: { mateIn: number | null }, side: 'white' | 'black'): number | null {
  if (line.mateIn === null || line.mateIn === 0 || (line.mateIn > 0) !== (side === 'white')) return null;
  return Math.abs(line.mateIn);
}
