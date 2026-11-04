/** "+1.3", "-0.4": the evaluation in pawns, White's side. (Its own file so
 * the studio's video renderer can use it without the React bar.) */
export function formatEval(cp: number): string {
  const pawns = cp / 100;
  return pawns > 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
}
