import type { CourseDocument } from '@freechesscoach/shared';

export interface DrillLine {
  /** The chapter's name: "The idea", "Greedy". */
  title: string;
  /** The creator's note for the line, when it has one. */
  note: string | null;
}

/** The line an episode belongs to, for telling the learner which one they
 * are on; null when the course has no chapter for it. */
export function drillLine(document: CourseDocument, episodeId: string | undefined): DrillLine | null {
  const chapter = document.chapters.find((each) => each.episodeIds.includes(episodeId ?? ''));
  if (!chapter) return null;
  return { title: chapter.title, note: document.lines.find((line) => line.id === chapter.lineId)?.note ?? null };
}

/** What the drill says as a line starts: "Now: Greedy", and which line was
 * just finished when it is a different one. Nothing while the line goes on. */
export function lineChange(from: DrillLine | null, to: DrillLine | null): { done: string | null; now: string } | null {
  if (!to) return null;
  if (!from) return { done: null, now: to.title };
  return from.title === to.title ? null : { done: from.title, now: to.title };
}

export interface LineProgress {
  title: string;
  /** Moves of yours in this line already played. */
  done: number;
  /** Moves of yours in this line. */
  total: number;
  current: boolean;
}

/** The run's lines in order, each with how far through its asked moves the
 * learner is, for the explorer's panel. Episodes of one chapter count as one line. */
export function lineProgress(
  document: CourseDocument,
  episodes: readonly { episodeId: string; steps: readonly { asked: boolean }[] }[],
  at: { episode: number; step: number }
): LineProgress[] {
  const lines: LineProgress[] = [];
  for (const [index, episode] of episodes.entries()) {
    const line = drillLine(document, episode.episodeId);
    if (!line) continue;
    const played = index < at.episode ? episode.steps : index === at.episode ? episode.steps.slice(0, at.step) : [];
    const done = played.filter((step) => step.asked).length;
    const total = episode.steps.filter((step) => step.asked).length;
    const last = lines[lines.length - 1];
    if (last && last.title === line.title) {
      last.done += done;
      last.total += total;
      last.current ||= index === at.episode;
    } else lines.push({ title: line.title, done, total, current: index === at.episode });
  }
  return lines;
}

/** Where the learner is, in words for the Continue card: "Greedy · move 3". */
export function placeLabel(document: CourseDocument, episodeId: string | undefined, step: number): string | null {
  const line = drillLine(document, episodeId);
  if (!line) return null;
  return step > 0 ? `${line.title} · move ${step}` : line.title;
}
