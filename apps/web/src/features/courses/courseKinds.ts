import type { CourseKind } from '@freechesscoach/shared';

/** docs/courses.md §3 names and §5.3's example directions. */
export const COURSE_KIND_INFO: Record<CourseKind, { label: string; example: string }> = {
  trap: { label: 'Trap', example: 'Englund Gambit trap for beginners. Make the viewer feel they’d play 6.Bc3 too.' },
  opening_reel: { label: 'Opening reel', example: 'Italian Game main line for 1000-rated players. One plan to remember.' },
  opening_course: { label: 'Opening course', example: 'Caro-Kann Advance for club players, main line plus the three sidelines in the PGN.' },
  tactics: { label: 'Tactic theme', example: 'Knight forks. Start with the easiest; teach what tells you a fork is there.' },
  master_game: { label: 'Master game', example: 'Capablanca’s endgame technique. Explain every Black move for 1200s.' }
};
