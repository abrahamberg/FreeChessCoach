import type { CandidateMoment, ClassifiedMove } from '@freechesscoach/chess-analysis';
import type { CoachingMoment, CoachingPlan } from '@freechesscoach/shared';

const MAX_MOMENTS = 5;
const REVEAL_DEPTH_PLIES = 4;
const KIND_PRIORITY: Record<CandidateMoment['kind'], number> = { user_mistake: 3, instructive: 2, turning_point: 1 };

/**
 * The coaching plan for a local-model setup, built from the engine review
 * alone — no LLM call. A local server runs one request at a time, and the
 * planner is a long structured-output call that a small local model often
 * gets wrong, so this makes the coach's first reply the session's first and
 * only LLM call. Not stored: a cloud setup later still gets the real
 * planner's plan.
 */
export function buildLocalCoachingPlan(moves: readonly ClassifiedMove[], candidates: readonly CandidateMoment[]): CoachingPlan {
  const picked = pickCandidates(moves, candidates);
  return {
    gameSummary: 'Prepared from the engine review only (local AI setup) — no written summary.',
    openingNote: 'Not prepared; look at the opening yourself if it matters.',
    themes: [],
    connectionToHistory: 'Not prepared; use the student profile above.',
    sessionGoal: describeSessionGoal(picked),
    moments: picked.map(({ move, kind }) => toMoment(move, kind))
  };
}

/**
 * A cloud setup gets a real goal sentence from the planner LLM
 * (analysis-planner.ts's `sessionGoal`), stated once by the coach and then
 * restated on every turn via coach-system.ts's `suggestedGoalLine` — a
 * durable anchor the model never has to hold in its own working memory. A
 * local setup skipped that call entirely (this file's own doc comment) and
 * used to leave `sessionGoal` blank, which meant a small model had to both
 * invent a goal purely from its own reasoning over the profile/stats tools
 * AND privately remember it for the rest of the session with nothing
 * durable to check itself against — the direct mechanism behind a local
 * session losing track of what it's supposed to be working on. This is
 * deliberately generic rather than a rich, evidence-specific sentence (that
 * synthesis is exactly what the real planner call exists for) — just
 * concrete enough to be worth restating every turn, derived purely from the
 * `kind` of the moments already picked above, no new data dependency.
 */
function describeSessionGoal(picked: PickedMoment[]): string {
  if (picked.length === 0) return '';
  const mistakes = picked.filter(({ kind }) => kind === 'user_mistake').length;
  if (mistakes > picked.length / 2) {
    return "What you do when your opponent creates a real threat — most of today's moments are places that idea cost you.";
  }
  if (picked.some(({ kind }) => kind === 'turning_point')) {
    return "How the evaluation swung sharply at this game's critical moments, and what actually caused each swing.";
  }
  return 'What worked well this game, and why — so it can be repeated on purpose next time.';
}

interface PickedMoment {
  move: ClassifiedMove;
  kind: CandidateMoment['kind'];
}

function pickCandidates(moves: readonly ClassifiedMove[], candidates: readonly CandidateMoment[]): PickedMoment[] {
  const withMoves = candidates.flatMap((candidate) => {
    const move = moves.find((m) => m.ply === candidate.ply);
    return move ? [{ move, kind: candidate.kind, cpLoss: candidate.cpLoss }] : [];
  });
  const ranked = withMoves
    .sort((a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] || b.cpLoss - a.cpLoss)
    .slice(0, MAX_MOMENTS)
    .sort((a, b) => a.move.ply - b.move.ply);
  if (ranked.length > 0) return ranked;
  const fallback = worstUserMove(moves);
  return fallback ? [{ move: fallback, kind: 'user_mistake' }] : [];
}

function worstUserMove(moves: readonly ClassifiedMove[]): ClassifiedMove | undefined {
  return moves.filter((move) => move.isUserMove).sort((a, b) => b.cpLoss - a.cpLoss)[0] ?? moves[0];
}

function toMoment(move: ClassifiedMove, kind: CandidateMoment['kind']): CoachingMoment {
  const label = moveLabel(move);
  const better = move.bestMoveSan && move.bestMoveSan !== move.moveSan ? ` The engine preferred ${move.bestMoveSan}.` : '';
  const line = move.bestLinePvSan ?? move.bestLineSan;
  return {
    ply: move.ply,
    kind,
    category: null,
    whatHappened: `${label} was rated ${move.quality}.${better}`,
    socraticQuestion: questionFor(kind, label),
    keyLine: line.slice(0, REVEAL_DEPTH_PLIES * 2).join(' '),
    revealDepthPlies: REVEAL_DEPTH_PLIES
  };
}

function questionFor(kind: CandidateMoment['kind'], label: string): string {
  if (kind === 'instructive') return `What made ${label} work here?`;
  if (kind === 'turning_point') return `What changed in the position after ${label}?`;
  return `What were you weighing when you played ${label}, and what did it allow?`;
}

function moveLabel(move: ClassifiedMove): string {
  const number = move.moveNumber ?? Math.floor(move.ply / 2) + 1;
  return `${number}${move.mover === 'white' ? '.' : '...'} ${move.moveSan}`;
}
