/** Coach `play_coach_move`/browser board-drag sentinel: "[board_move] I
 * played e4 (position now: <fen>)" — rendered as a MoveCard, not prose. */
export const BOARD_MOVE_PATTERN = /^\[board_move\] I played (\S+) \(position now: (.+)\)$/;
// architecture §14: play mode's student move sentinel — no fen, since the
// board is already at the resulting position by the time this arrives
// (see SessionBoardColumn's submitPlayMove). The optional trailing group is
// usePlayMoveSubmit's "used a hint" annotation (BoardActionBar's Hint
// button) — same idea as [diverged_line]'s own "exploring from move…" note,
// surfaced by renderMessageItem as a MoveCard flag instead of raw text.
export const PLAYER_MOVE_PATTERN = /^\[player_move\] I played (\S+)\.( \(used a hint\))?$/;
