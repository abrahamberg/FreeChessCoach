import type { CourseKind } from '@freechesscoach/shared';

/** docs/courses.md §3 names, a line on each for the new-course page, and
 * §5.3's example directions. */
export const COURSE_KIND_INFO: Record<CourseKind, { label: string; summary: string; example: string }> = {
  trap: { label: 'Trap', summary: 'The bait, the mistake and the punishment.', example: 'Englund Gambit trap for beginners. Make the viewer feel they’d play 6.Bc3 too.' },
  opening: {
    label: 'Opening',
    summary: 'A main line, its sidelines and the traps inside.',
    example: 'Caro-Kann Advance for club players, main line plus the three sidelines in the PGN.'
  },
  tactics: { label: 'Tactic theme', summary: 'One tactic, from several examples.', example: 'Knight forks. Start with the easiest; teach what tells you a fork is there.' },
  puzzle: {
    label: 'Puzzle',
    summary: 'A position to solve, like mate in 3.',
    example: 'Smothered mate in two. Show how to find it: checks first, even a queen sacrifice.'
  },
  master_game: { label: 'Master game', summary: 'A famous game, move by move.', example: 'Capablanca’s endgame technique. Explain every Black move for 1200s.' },
  endgame: {
    label: 'Endgame',
    summary: 'A position and its technique, like the Lucena.',
    example: 'The Lucena position: build a bridge. Show why only one move keeps the win.'
  }
};
