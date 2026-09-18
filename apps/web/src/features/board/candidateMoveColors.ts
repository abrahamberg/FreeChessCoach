// Deliberately not the same tokens legal-move dots/selection use, so a
// candidate-move overlay never gets confused with those. Shared by every
// board feature that draws up to a handful of ranked candidate-move arrows
// (the bot session's Hint button, the Explore panel's engine feedback) so
// they read as the same visual language rather than each picking its own
// palette.
const CANDIDATE_MOVE_COLORS = ['var(--annotate-1)', 'var(--annotate-2)', 'var(--annotate-hover)'];

export function candidateMoveColor(index: number): string {
  return CANDIDATE_MOVE_COLORS[index % CANDIDATE_MOVE_COLORS.length] ?? 'var(--annotate-1)';
}

export function candidateMoveHighlightColor(index: number): string {
  return candidateMoveHighlightFromColor(candidateMoveColor(index));
}

/** Same light-tint treatment as candidateMoveHighlightColor, from an
 * already-resolved arrow color rather than an index — useExploreFeedback's
 * best-reply arrows are already colored (arrowsFromLines), so deriving their
 * own square highlight only needs the color, not the index that produced
 * it. */
export function candidateMoveHighlightFromColor(color: string): string {
  return `color-mix(in srgb, ${color} 40%, transparent)`;
}
