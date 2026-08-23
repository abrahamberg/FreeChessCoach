/** Coach `play_coach_move`/browser board-drag sentinel: "[board_move] I
 * played e4 (position now: <fen>)" — rendered as a MoveCard, not prose. */
export const BOARD_MOVE_PATTERN = /^\[board_move\] I played (\S+) \(position now: (.+)\)$/;
// architecture §14: play mode's student move sentinel — no fen, since the
// board is already at the resulting position by the time this arrives
// (see SessionBoardColumn's submitPlayMove).
export const PLAYER_MOVE_PATTERN = /^\[player_move\] I played (\S+)\.$/;
