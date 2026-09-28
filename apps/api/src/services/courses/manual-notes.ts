import type { CourseNodeFacts } from '@freechesscoach/chess-analysis';
import type { CourseArrow, CourseEpisode, CoursePly } from '@freechesscoach/shared';

/** docs/courses.md §10: a note pre-filled from checked facts only — the
 * creator's own comment first, then the opening name, the board facts and
 * the tactic sentences. Empty when there is nothing checked to say. */
export function noteText(facts: CourseNodeFacts): string {
  const parts: string[] = [];
  if (facts.creatorComment) parts.push(facts.creatorComment);
  if (facts.inBook && facts.openingName) parts.push(`Book move in the ${facts.openingName}.`);
  // "moves the bishop from d2 to c3" is for the model; the board shows it.
  const board = facts.board.filter((fact) => !/^(moves the |castles )/.test(fact));
  if (board.length) parts.push(`${facts.san} ${board.join(', ')}.`);
  parts.push(...facts.tactics);
  return parts.join(' ');
}

export interface EpisodeDraft {
  role: string;
  /** The episode's prompt for the creator, e.g. "bait: why does this move look natural?". */
  focus: string;
  nodeIds: string[];
  /** Nodes that speak in the course (defaults to all of `nodeIds`). */
  noteNodeIds?: string[];
  drillNodeIds?: string[];
  quiz?: CourseEpisode['quiz'];
  extraNotes?: CoursePly[];
}

export class EpisodeBuilder {
  readonly episodes: CourseEpisode[] = [];

  /** `arrows` are the creator's own from the PGN, carried onto each note. */
  constructor(
    private readonly facts: ReadonlyMap<string, CourseNodeFacts>,
    private readonly arrows: ReadonlyMap<string, CourseArrow[]>
  ) {}

  /** Adds the episode and returns its id; a draft with no nodes is skipped. */
  add(draft: EpisodeDraft): string[] {
    const first = draft.nodeIds[0];
    const last = draft.nodeIds[draft.nodeIds.length - 1];
    if (!first || !last) return [];
    const id = `e${this.episodes.length + 1}`;
    const plies = [...this.plies(draft.noteNodeIds ?? draft.nodeIds), ...(draft.extraNotes ?? [])];
    this.episodes.push({
      id,
      role: draft.role,
      focus: draft.focus,
      startNodeId: first,
      endNodeId: last,
      plies,
      budget: { long: plies.filter((ply) => ply.long).length, short: plies.filter((ply) => ply.short).length },
      ...(draft.quiz ? { quiz: draft.quiz } : {}),
      drillNodeIds: draft.drillNodeIds ?? []
    });
    return [id];
  }

  fact(nodeId: string): CourseNodeFacts | undefined {
    return this.facts.get(nodeId);
  }

  /** Each move speaks in the course; the clip takes the first one or two
   * with a tactic or a critical moment (the template's short). */
  private plies(nodeIds: string[]): CoursePly[] {
    let clip = 0;
    return nodeIds.flatMap((nodeId) => {
      const facts = this.facts.get(nodeId);
      if (!facts) return [];
      const short = clip < 2 && (facts.critical || facts.tactics.length > 0);
      if (short) clip += 1;
      return [{ nodeId, text: noteText(facts), arrows: this.arrows.get(nodeId) ?? [], long: true, short }];
    });
  }
}

/** Every learner move, and opponent moves the facts have something on. */
export function noteworthy(nodeIds: string[], learner: 'white' | 'black', builder: EpisodeBuilder): string[] {
  return nodeIds.filter((id) => {
    const facts = builder.fact(id);
    return facts && (facts.side === learner || facts.creatorComment || facts.tactics.length > 0);
  });
}
