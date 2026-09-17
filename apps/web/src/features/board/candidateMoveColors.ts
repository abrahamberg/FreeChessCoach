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
  return `color-mix(in srgb, ${candidateMoveColor(index)} 40%, transparent)`;
}
