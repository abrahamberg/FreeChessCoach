/** cp is White-perspective centipawns (services/engine/src/uci.ts normalizes
 * UCI's side-to-move-relative score before it ever reaches this layer),
 * matching ClassifiedMove.evalAfterCp's convention; mateIn is signed the same
 * way (positive = White mates). Shared by episode-context.ts's "Current
 * position" prose and position-analysis-summary.ts's get_engine_analysis
 * digest — one eval format for every place the coach's context renders one.
 *
 * The side label is part of the format, not decoration: a bare "-2.15" read
 * by a coach whose student plays Black looks like a bad number, so "best
 * move -2.15, played -0.27, cost 180cp" reads as self-contradictory and a
 * small local model loops re-running the engine to reconcile it. */
export function formatEval(cp: number | null, mateIn: number | null): string {
  if (mateIn !== null) return `${mateIn > 0 ? 'White' : 'Black'} mates in ${Math.abs(mateIn)}`;
  if (cp === null) return 'eval unknown';
  const pawns = (cp / 100).toFixed(2);
  return `eval ${cp >= 0 ? '+' : ''}${pawns}, ${sideLabel(cp)}`;
}

/** Below half a pawn either way the position is close enough to level that
 * naming a side "better" would overstate it. */
const ABOUT_EQUAL_CP = 50;

function sideLabel(cp: number): string {
  if (Math.abs(cp) < ABOUT_EQUAL_CP) return 'about equal';
  return cp > 0 ? 'White better' : 'Black better';
}
