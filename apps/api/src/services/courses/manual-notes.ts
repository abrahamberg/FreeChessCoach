import { episodeKeyMoves, type CourseNodeFacts, type CourseSkeleton, type CourseTemptingFacts } from '@freechesscoach/chess-analysis';
import type { CourseArrow, CourseEpisode, CoursePly, CourseTempting, CourseVideos } from '@freechesscoach/shared';

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
    private readonly arrows: ReadonlyMap<string, CourseArrow[]>,
    private readonly skeleton: CourseSkeleton | null = null,
    readonly videos: CourseVideos = { video: true, reel: true }
  ) {}

  /** Adds the episode and returns its id; a draft with no nodes is skipped. */
  add(draft: EpisodeDraft): string[] {
    const first = draft.nodeIds[0];
    const last = draft.nodeIds[draft.nodeIds.length - 1];
    if (!first || !last) return [];
    const id = `e${this.episodes.length + 1}`;
    const sans = new Map(draft.nodeIds.map((nodeId) => [nodeId, this.facts.get(nodeId)?.san ?? '']));
    const keys = episodeKeyMoves({ role: draft.role, path: draft.nodeIds, answerNodeId: draft.quiz?.answerNodeId ?? null, sans, skeleton: this.skeleton });
    const speaking = new Set([...(draft.noteNodeIds ?? draft.nodeIds), ...keys]);
    const plies = [...this.plies(draft.nodeIds.filter((nodeId) => speaking.has(nodeId)), keys), ...(draft.extraNotes ?? [])];
    this.episodes.push({
      id,
      role: draft.role,
      focus: draft.focus,
      startNodeId: first,
      endNodeId: last,
      plies,
      budget: { course: plies.filter((ply) => ply.course).length, video: plies.filter((ply) => ply.video).length, ...(keys.length ? { keyNodeIds: keys } : {}) },
      ...(draft.quiz ? { quiz: draft.quiz } : {}),
      drillNodeIds: draft.drillNodeIds ?? []
    });
    return [id];
  }

  fact(nodeId: string): CourseNodeFacts | undefined {
    return this.facts.get(nodeId);
  }

  /** Each move speaks in the course; the YouTube video, when the course
   * makes one (§13.1), takes the key moves, then the first with a tactic or
   * a critical moment, two in all unless there are more key moves. */
  private plies(nodeIds: string[], keys: readonly string[]): CoursePly[] {
    let spoken = keys.length;
    return nodeIds.flatMap((nodeId) => {
      const facts = this.facts.get(nodeId);
      if (!facts) return [];
      const key = keys.includes(nodeId);
      const video = this.videos.video && (key || (spoken < 2 && (facts.critical || facts.tactics.length > 0)));
      if (video && !key) spoken += 1;
      const tempting = facts.tempting.map(temptingNote);
      return [{ nodeId, text: noteText(facts), arrows: this.arrows.get(nodeId) ?? [], course: true, video, ...(tempting.length ? { tempting } : {}) }];
    });
  }
}

/** §13.5 from checked facts: the engine's answer and what it does ("Nxc3
 * captures the queen on c3."), for the creator to write over. The first
 * board fact is the answer's own move, which the SAN already says. */
export function temptingNote(facts: CourseTemptingFacts): CourseTempting {
  const [answer] = facts.refutation;
  const effects = facts.after.length > 1 ? facts.after.slice(1) : facts.after;
  const listed = effects.length > 1 ? `${effects.slice(0, -1).join(', ')} and ${effects.at(-1)}` : (effects[0] ?? '');
  const why = answer ? `${answer} ${listed}.`.replace(/ \.$/, '.') : facts.verdict;
  return { san: facts.san, why: facts.notTheAnswer ? `Not the answer: ${facts.notTheAnswer}. ${why}` : why, refutation: facts.refutation };
}

/** Every learner move, and opponent moves the facts have something on. */
export function noteworthy(nodeIds: string[], learner: 'white' | 'black', builder: EpisodeBuilder): string[] {
  return nodeIds.filter((id) => {
    const facts = builder.fact(id);
    return facts && (facts.side === learner || facts.creatorComment || facts.tactics.length > 0);
  });
}
