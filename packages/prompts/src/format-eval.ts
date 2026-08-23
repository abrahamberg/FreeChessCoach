/** cp is White-perspective centipawns (services/engine/src/uci.ts normalizes
 * UCI's side-to-move-relative score before it ever reaches this layer),
 * matching ClassifiedMove.evalAfterCp's convention. Shared by
 * episode-context.ts's "Current position" prose and
 * position-analysis-summary.ts's get_engine_analysis digest — one eval
 * format for every place the coach's context renders one. */
export function formatEval(cp: number | null, mateIn: number | null): string {
  if (mateIn !== null) return `mate in ${Math.abs(mateIn)}`;
  if (cp === null) return 'eval unknown';
  const pawns = (cp / 100).toFixed(2);
  return `eval ${cp >= 0 ? '+' : ''}${pawns}`;
}
