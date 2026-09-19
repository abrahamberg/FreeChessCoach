import type { MistakeCategory } from '@freechesscoach/shared';
import type { RealGameKey } from './real-games.js';

/** The "Recent lessons" list: eight coaching sessions over the last three weeks,
 * oldest first, telling one continuous story — hanging pieces first, then the
 * board-update habit behind them, then forks, then the recapture reflex. Each is
 * matched to a game with the wanted result (see seed-beginner.ts), so the players,
 * dates and results shown on the Progress page always agree with the Games list. */
export interface LessonSpec {
  daysAgo: number;
  result: 'win' | 'loss';
  /** A real, engine-analyzed fixture game (its day is fixed by real-games.ts),
   * or 'planned' for one of the shallow demo games nearest that day. */
  game: RealGameKey | 'planned';
  summary: string;
  homework: string | null;
}

export const BEGINNER_LESSONS: LessonSpec[] = [
  {
    daysAgo: 22,
    result: 'loss',
    game: 'planned',
    summary: 'A queen-side pawn fork won a bishop for your opponent on move 14 — the bishop had landed on a square a pawn already attacked. Three of your five mistakes were pieces moved to attacked squares.',
    homework: 'Before every move, say what attacks the square you are moving to.'
  },
  {
    daysAgo: 19,
    result: 'win',
    game: 'planned',
    summary: 'A clean win: you traded when ahead and castled early. We talked about why the game felt easy — you kept your pieces defended, so nothing needed rescuing.',
    homework: null
  },
  {
    daysAgo: 16,
    result: 'loss',
    game: 'caroGreed',
    summary: 'You took a knight on g3 with your queen on move 8. It looked free, but it left the queen exposed and let their h-pawn take your bishop on g6, a bishop for a knight. Before a capture, ask what it leaves behind.',
    homework: 'Before every capture, name the piece it leaves undefended.'
  },
  {
    daysAgo: 13,
    result: 'win',
    game: 'planned',
    summary: 'Good pause before recapturing on e5 — you found the in-between check and won a pawn. Your endgame technique held up under time pressure.',
    homework: 'Solve 10 knight-fork puzzles, then 10 mixed.'
  },
  {
    daysAgo: 10,
    result: 'loss',
    game: 'caroTrap',
    summary: 'You found a real tactic on move 23: ...b5 trapped their bishop. Then the board changed and you did not follow it. On move 24 you missed a knight you could take on d5, and on move 29 a check that won material. Finding the idea is not your problem; keeping the picture up to date is.',
    homework: 'After each of their moves, ask what it changed before you look for your own.'
  },
  {
    daysAgo: 7,
    result: 'win',
    game: 'londonWin',
    summary: 'A win, but a lucky one. After ...Bxf4 on move 9 you did not recapture, and you passed up several free captures later. You still won by finding Qxd6 on move 53. Your tactics vision is ahead of your board tracking.',
    homework: 'Play two 10-minute games, looking for the recapture first.'
  },
  {
    daysAgo: 4,
    result: 'loss',
    game: 'featured',
    summary: 'You were winning. On move 32 you missed a free rook (Qxc1+), and on move 37, after the queens came off, you moved a knight instead of recapturing with your rook and lost it. The same thing twice: the board changed and your picture of it did not.',
    homework: 'After every capture, ask what it changed. Then look for the recapture first.'
  },
  {
    daysAgo: 2,
    result: 'win',
    game: 'scotchWin',
    summary: 'A win, but not a clean one. You missed a free piece on move 10, left your queen undefended on move 18, and passed up a forced mate on moves 34 and 35. The result was right; the process was not. We replayed the mate together.',
    homework: 'Find the mate in 6 from move 35 again, then solve 10 mate-in-3 puzzles.'
  }
];

interface FindingSpec {
  category: MistakeCategory;
  severity: 'minor' | 'significant' | 'critical';
  description: string;
  /** 0 = the newest of the last twenty games. */
  gameFromNewest: number;
}

const DESCRIPTIONS: Partial<Record<MistakeCategory, string[]>> = {
  hanging_piece: ['Moved a bishop to a square a pawn attacked.', 'Left a knight undefended after the opponent\'s last move.', 'Did not notice a piece was attacked by the move just played.'],
  missed_tactic: ['Missed a knight fork on the king and queen.', 'Did not see a loose bishop that could be taken.', 'Missed a pin against the queen.'],
  calculation_error: ['Recaptured without checking for a stronger in-between move.', 'Did not check the destination square before releasing the piece.'],
  allowed_tactic: ['Allowed a knight fork by leaving two pieces on the same colour.', 'Left the back rank without luft.'],
  opening_knowledge: ['Moved the same piece twice in the opening.'],
  king_safety: ['Delayed castling while the centre was opening.'],
  piece_activity: ['Left a rook on the back rank for the whole middlegame.'],
  endgame_technique: ['Did not bring the king toward the centre in the endgame.'],
  no_plan: ['Shuffled pieces with no clear plan after the opening.']
};

/** Category counts across the last 20 games, and how many of those sit in the last 5:
 * the trend chart should show hanging pieces high but falling. */
const TREND: [MistakeCategory, number, number][] = [
  ['hanging_piece', 9, 2],
  ['missed_tactic', 6, 2],
  ['calculation_error', 5, 1],
  ['allowed_tactic', 4, 1],
  ['opening_knowledge', 3, 0],
  ['king_safety', 2, 1],
  ['piece_activity', 2, 0],
  ['endgame_technique', 2, 0],
  ['no_plan', 1, 0]
];

export function buildFindingSpecs(): FindingSpec[] {
  return TREND.flatMap(([category, last20, last5]) =>
    Array.from({ length: last20 }, (_, i): FindingSpec => {
      const isRecent = i < last5;
      const descriptions = DESCRIPTIONS[category] ?? ['Noted by the coach.'];
      return {
        category,
        severity: i % 4 === 0 ? 'significant' : 'minor',
        description: descriptions[i % descriptions.length] as string,
        gameFromNewest: isRecent ? i % 5 : 5 + ((i * 3 + category.length) % 15)
      };
    })
  );
}
