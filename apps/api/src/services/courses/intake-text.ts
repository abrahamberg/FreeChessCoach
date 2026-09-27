import { randomBytes } from 'node:crypto';

const MAX_TITLE = 120;
const MAX_SLUG_WORDS = 60;

/** The direction's first sentence ("Englund Gambit trap for beginners"), or
 * a placeholder the creator renames in the editor. */
export function courseTitle(direction: string): string {
  const first = direction.split(/(?<=[.!?])\s/)[0]?.replace(/[.!?]$/, '').trim() ?? '';
  return (first || 'Untitled course').slice(0, MAX_TITLE);
}

/** Unique enough to never collide in practice; the table's UNIQUE catches the rest. */
export function courseSlug(title: string): string {
  const words = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_WORDS)
    .replace(/-$/, '');
  return `${words || 'course'}-${randomBytes(3).toString('hex')}`;
}

/** The first game's [Result] tag, e.g. "1-0"; null when absent or "*". */
export function resultHeader(pgn: string): string | null {
  const result = /\[Result\s+"([^"]*)"\]/.exec(pgn)?.[1];
  return result && result !== '*' ? result : null;
}
