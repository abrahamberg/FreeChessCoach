/**
 * Piecewise interpolation of `x -> y` through `anchors` (ascending by `x`).
 * `lerp` decides how the two bracketing anchors combine at fraction `t` —
 * plain linear for a count (e.g. this file's own callers in
 * `bot-roster.ts`), logit-space for a 0-1 probability — that choice is the
 * only thing that differed between the two ad hoc copies of this
 * bracket-finding loop this factors out (docs/plan.md Phase 62 cleanup).
 * `x` outside the anchor range clamps to the nearest anchor's own `y`
 * rather than extrapolating past it.
 */
export function interpolateAnchors(
  anchors: ReadonlyArray<readonly [x: number, y: number]>,
  x: number,
  lerp: (yLower: number, yUpper: number, t: number) => number
): number {
  const first = anchors[0];
  const last = anchors.at(-1);
  if (!first || !last) throw new Error('interpolateAnchors: anchors must be non-empty');

  const clampedX = Math.min(Math.max(x, first[0]), last[0]);
  for (let i = 0; i < anchors.length - 1; i++) {
    const lower = anchors[i];
    const upper = anchors[i + 1];
    if (!lower || !upper) continue;
    const [xLower, yLower] = lower;
    const [xUpper, yUpper] = upper;
    if (clampedX < xLower || clampedX > xUpper) continue;
    const t = xUpper === xLower ? 0 : (clampedX - xLower) / (xUpper - xLower);
    return lerp(yLower, yUpper, t);
  }

  return clampedX <= first[0] ? first[1] : last[1];
}
