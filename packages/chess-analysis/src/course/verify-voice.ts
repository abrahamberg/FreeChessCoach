import type { CourseDocument } from '@freechesscoach/shared';
import type { CourseVerifyProblem } from './verify.js';

/**
 * docs/courses.md §7, the whole course: the coach's voice across episodes
 * (no line starting like two others in one episode, no line said twice, no
 * catchphrase). The studio runs `sentenceOpeners` over its videos' lines too.
 */
export function verifyCourseVoice(document: CourseDocument): CourseVerifyProblem[] {
  const problems: CourseVerifyProblem[] = [];
  const seen = new Map<string, string>();
  for (const episode of document.episodes) {
    const lines = episode.plies.map((ply) => (ply.course ? ply.text : '')).filter((line) => line.trim());
    const openers = new Map<string, number>();
    for (const line of lines) {
      const first = normalised(line).split(/\s+/)[0] ?? '';
      if (first.length > 3) openers.set(first, (openers.get(first) ?? 0) + 1);
      const key = normalised(line);
      const earlier = seen.get(key);
      if (earlier && earlier !== episode.id) problems.push({ code: 'voice', nodeId: null, message: `"${line.trim()}" is said in ${earlier} and again in ${episode.id}` });
      seen.set(key, earlier ?? episode.id);
    }
    for (const [word, count] of openers) {
      if (count > 2) problems.push({ code: 'voice', nodeId: null, message: `${count} lines in ${episode.id} start with "${word}": vary how the coach starts` });
    }
  }
  problems.push(...catchphraseProblems(document));
  return problems;
}

/** Board and everyday words any coach starts with; not a catchphrase. */
const COMMON_OPENERS = new Set([
  'white', "white's", 'black', "black's", 'this', 'that', "that's", 'your', 'their', "it's", 'there', "there's", 'here', "here's", 'then', 'now',
  'king', 'queen', 'rook', 'bishop', 'knight', 'pawn',
  // What a coach tells a player to do: "Take back with the pawn" three times
  // in a course is chess, not a catchphrase.
  'take', 'takes', 'play', 'push', 'check', 'trade', 'castle', 'move'
]);
const CATCHPHRASE_LINES = 3;

/** Every spoken line of the course. */
export function courseLines(document: CourseDocument): string[] {
  return document.episodes.flatMap((episode) => episode.plies.map((ply) => (ply.course ? ply.text : ''))).filter((line) => line.trim());
}

/** How many lines start a sentence with each word, everyday words aside. */
export function sentenceOpeners(lines: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    // A SAN ("Bc3") starts with a capital too; only plain words count.
    const starts = new Set(line.split(/(?<=[.!?])\s+/).map((sentence) => normalised(sentence).split(/\s+/)[0] ?? '').filter((word) => /^[a-z']+[,;:]?$/.test(word)));
    for (const word of starts) {
      const plain = word.replace(/[,;:]$/, '');
      if (plain.length > 3 && !COMMON_OPENERS.has(plain)) counts.set(plain, (counts.get(plain) ?? 0) + 1);
    }
  }
  return counts;
}

/** A word the coach starts sentences with in 3 or more lines across the
 * course ("Execute." in five): a catchphrase, not a voice. */
function catchphraseProblems(document: CourseDocument): CourseVerifyProblem[] {
  return [...sentenceOpeners(courseLines(document))]
    .filter(([, count]) => count >= CATCHPHRASE_LINES)
    .map(([word, count]) => ({ code: 'voice' as const, nodeId: null, message: `${count} lines start a sentence with "${word}" across the course: a catchphrase, vary it` }));
}

function normalised(text: string): string {
  const lower = text.toLowerCase().replace(/’/g, "'").trim();
  let end = lower.length;
  while (end > 0 && '.!?,;:'.includes(lower[end - 1]!)) end--;
  return lower.slice(0, end).trim();
}
