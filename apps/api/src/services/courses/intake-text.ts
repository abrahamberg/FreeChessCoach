import type { CourseResponse } from '@freechesscoach/shared';
const MAX_TITLE = 120;
const MAX_SLUG_WORDS = 60;

/** The PGN's [Event] ("Evans Gambit"), else the direction's first sentence
 * ("Englund Gambit trap for beginners"), else a placeholder the creator
 * renames in the editor. */
export function courseTitle(pgn: string, direction: string): string {
  const event = courseHeaders(pgn).event;
  if (event) return event.slice(0, MAX_TITLE);
  const first = direction.split(/(?<=[.!?])\s/)[0]?.replace(/[.!?]$/, '').trim() ?? '';
  return (first || 'Untitled course').slice(0, MAX_TITLE);
}

/** Words that say what kind of lesson it is, not what it teaches: a link
 * leaves them off its end ("Stafford Gambit trap" is /learn/stafford-gambit). */
const SLUG_TAIL_WORDS = ['trap', 'traps', 'course', 'lesson'];

/** The course's address, from its title: "Stafford Gambit" is
 * /learn/stafford-gambit, a link a person can read and say. A second course
 * of that name is stafford-gambit-2 (`taken`: the slugs that start the same). */
export function courseSlug(title: string, taken: readonly string[] = []): string {
  const all = title
    .toLowerCase()
    .normalize('NFKD')
    // The accents NFKD splits off: "Défense" is "defense", not "de-fense".
    .replace(/[\u0300-\u036f]/g, '')
    // "Noah's Ark" is "noahs-ark", not "noah-s-ark".
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let end = all.length;
  while (end > 1 && SLUG_TAIL_WORDS.includes(all[end - 1]!)) end -= 1;
  const words = all.slice(0, end).join('-').slice(0, MAX_SLUG_WORDS).replace(/-$/, '') || 'course';
  if (!taken.includes(words)) return words;
  for (let count = 2; ; count += 1) if (!taken.includes(`${words}-${count}`)) return `${words}-${count}`;
}

/** The first game's [Result] tag, e.g. "1-0"; null when absent or "*". */
export function resultHeader(pgn: string): string | null {
  const result = /\[Result\s+"([^"]*)"\]/.exec(pgn)?.[1];
  return result && result !== '*' ? result : null;
}

/** The first game's players, event and year for the master-game playbook;
 * null where a tag is missing or unknown ("?", "????.??.??"). */
export function courseHeaders(pgn: string): { white: string | null; black: string | null; event: string | null; year: string | null } {
  const tag = (name: string): string | null => headerTag(pgn, name);
  return { white: tag('White'), black: tag('Black'), event: tag('Event'), year: /^\d{4}/.exec(tag('Date') ?? '')?.[0] ?? null };
}

/** The PGN's players with their ratings, for the reel's labels; null for a side it does not name. */
export function coursePlayers(pgn: string): CourseResponse['players'] {
  const player = (side: 'White' | 'Black') => {
    const name = headerTag(pgn, side);
    const rating = /^\d{3,4}$/.exec(headerTag(pgn, `${side}Elo`) ?? '')?.[0];
    return name ? { name, rating: rating ? Number(rating) : null } : null;
  };
  return { white: player('White'), black: player('Black') };
}

function headerTag(pgn: string, name: string): string | null {
  const value = new RegExp(`\\[${name}\\s+"([^"]*)"\\]`).exec(pgn)?.[1]?.trim();
  return value && !/^[?.\s]*$/.test(value) ? value : null;
}
