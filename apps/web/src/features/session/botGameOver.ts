export type BotGameOverReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_move_rule'
  | 'timeout'
  | 'resignation';

export interface BotGameOverInfo {
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: BotGameOverReason;
}

const DRAW_REASON_TEXT: Record<'stalemate' | 'insufficient_material' | 'threefold_repetition' | 'fifty_move_rule', string> = {
  stalemate: 'Draw by stalemate.',
  insufficient_material: 'Draw by insufficient material.',
  threefold_repetition: 'Draw by threefold repetition.',
  fifty_move_rule: 'Draw by the fifty-move rule.'
};

/** Renders how a play_bot game ended, from the student's own point of view —
 * shared by BotStatusPanel's inline status line and GameOverDialog's popup,
 * so both read identically regardless of where the student notices the game
 * ended. */
export function describeGameOver(gameOver: BotGameOverInfo, userColor: 'white' | 'black', botName: string): string {
  const userWon = (userColor === 'white' && gameOver.result === '1-0') || (userColor === 'black' && gameOver.result === '0-1');
  switch (gameOver.reason) {
    case 'checkmate':
      return userWon ? 'Checkmate — you win!' : `Checkmate — ${botName} wins.`;
    case 'timeout':
      return userWon ? "Time's up — you win!" : `Time's up — ${botName} wins.`;
    case 'resignation':
      // The only way this reason fires today is the student's own "Resign"
      // button (bots never resign), so the userWon branch is unreachable in
      // practice — kept symmetric anyway rather than assuming that forever.
      return userWon ? `${botName} resigned — you win!` : `You resigned — ${botName} wins.`;
    default:
      return DRAW_REASON_TEXT[gameOver.reason];
  }
}
