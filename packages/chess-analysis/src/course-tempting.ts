import { Chess, type Square } from 'chess.js';
import type { CourseKind, EngineEval } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import type { CourseDossier } from './course-dossier.js';
import { boardFacts, lineWords } from './course-dossier-words.js';
import { captureWords, exchangeLoss } from './course-material.js';
import type { CourseTree } from './course-tree.js';
import { toCpWhite, winPctFor } from './win-probability.js';

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
/** Candidates per position sent to the engine, before the engine thins them. */
const MAX_CANDIDATES = 6;
const MAX_REFUTATION_PLIES = 4;
const KIND_ORDER = { check: 0, capture: 1, threat: 2 } as const;

export type TemptingKind = keyof typeof KIND_ORDER;

/** docs/courses.md §13.5: a move that looks right and fails, and why. */
export interface CourseTemptingFacts {
  san: string;
  kind: TemptingKind;
  /** What the tempting move itself does on the board, from chess.js. */
  does: string[];
  /** The engine's answer to it, at most 4 plies. */
  refutation: string[];
  /** What the answer does on the board, from chess.js. */
  after: string[];
  /** Who takes what over the move and its refutation ("Black takes a pawn;
   * White takes the queen"), so the model never works it out. */
  captures: string;
  /** The position after the tempting move, in the dossier's words. */
  verdict: string;
}

export interface TemptingCandidate {
  nodeId: string;
  san: string;
  kind: TemptingKind;
  /** The position the candidate is played from (the course move's). */
  fenBefore: string;
  /** The position after the candidate: what the engine evaluates. */
  fen: string;
}

/**
 * §13.5, before the engine: at every critical node, every quiz answer, and
 * every learner move of a puzzle or tactics course, the checks, captures and
 * threats the side to move could play instead, except the move played and
 * the engine's ranked moves. Checks first, then captures by value taken,
 * then threats; at most 6 a position.
 */
export function temptingCandidates(tree: CourseTree, dossier: CourseDossier, kind: CourseKind | null): TemptingCandidate[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const everyLearnerMove = kind === 'puzzle' || kind === 'tactics';
  return dossier.nodes.flatMap((facts) => {
    const asked = facts.critical || facts.quizEligible || (everyLearnerMove && facts.side === dossier.learnerSide);
    const node = byId.get(facts.nodeId);
    if (!asked || !node) return [];
    const fenBefore = node.parentId ? (byId.get(node.parentId)?.fenAfter ?? tree.startFen) : tree.startFen;
    const ranked = new Set([facts.san, ...(facts.bestInstead ? [facts.bestInstead.san] : []), ...facts.alternatives.map((line) => line.san)]);
    return movesWorthTrying(fenBefore)
      .filter((candidate) => !ranked.has(candidate.san))
      .slice(0, MAX_CANDIDATES)
      .map(({ san, kind: moveKind, fen }) => ({ nodeId: facts.nodeId, san, kind: moveKind, fenBefore, fen }));
  });
}

/** Checks, captures and threats from a position, in the order a strong
 * player looks at them. A mate is never tempting: it is the move. */
interface WorthTrying {
  san: string;
  kind: TemptingKind;
  fen: string;
  value: number;
}

function movesWorthTrying(fen: string): WorthTrying[] {
  const chess = new Chess(fen);
  const found = chess.moves({ verbose: true }).flatMap((move): WorthTrying[] => {
    const after = new Chess(move.after);
    if (after.isCheckmate()) return [];
    if (move.san.endsWith('+')) return [{ san: move.san, kind: 'check', fen: move.after, value: 0 }];
    if (move.captured) return [{ san: move.san, kind: 'capture', fen: move.after, value: PIECE_VALUES[move.captured] ?? 0 }];
    const threat = threatens(after, move.to, move.piece, move.color);
    return threat ? [{ san: move.san, kind: 'threat', fen: move.after, value: threat }] : [];
  });
  return found.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.value - a.value);
}

/** The value of the best piece the moved piece now attacks that is either
 * undefended or worth more than it; 0 when none. */
function threatens(board: Chess, from: Square, piece: string, color: 'w' | 'b'): number {
  const enemy = color === 'w' ? 'b' : 'w';
  let best = 0;
  for (const row of board.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== enemy || cell.type === 'k') continue;
      if (!board.attackers(cell.square, color).includes(from)) continue;
      const value = PIECE_VALUES[cell.type] ?? 0;
      const defended = board.attackers(cell.square, enemy).length > 0;
      if (!defended || value > (PIECE_VALUES[piece] ?? 0)) best = Math.max(best, value);
    }
  }
  return best;
}

/**
 * §13.5, after the engine: a candidate is tempting when it costs the mover
 * at least `temptingDrop` points of win% against the best move, or walks
 * into mate, and the answer is not a plain capture that leaves the mover
 * `obviousLoss` points down: a queen taking a defended piece is seen at a
 * glance, so the course has nothing to teach there (the strong model's
 * Englund run discussed nine of them). At most 3 a node, in the candidates'
 * order, each with what it does, the engine's answer and what that does.
 */
export function withTempting(dossier: CourseDossier, candidates: TemptingCandidate[], evalsByFen: ReadonlyMap<string, EngineEval>): CourseDossier {
  const kept = new Map<string, CourseTemptingFacts[]>();
  for (const candidate of candidates) {
    const facts = dossier.nodes.find((node) => node.nodeId === candidate.nodeId);
    const best = evalsByFen.get(candidate.fenBefore)?.lines[0];
    const answer = evalsByFen.get(candidate.fen)?.lines[0];
    const list = kept.get(candidate.nodeId) ?? [];
    if (!facts || !best || !answer || list.length >= CONFIG.courses.maxTempting) continue;
    const drop = winPctFor(facts.side, toCpWhite(best)) - winPctFor(facts.side, toCpWhite(answer));
    const walksIntoMate = answer.mateIn !== null && (answer.mateIn > 0) === (facts.side === 'black');
    if (drop < CONFIG.courses.temptingDrop && !walksIntoMate) continue;
    if (exchangeLoss(candidate.fenBefore, candidate.san, answer.moveSan) >= CONFIG.courses.obviousLoss) continue;
    const refutation = (answer.pvSan?.length ? answer.pvSan : [answer.moveSan]).slice(0, MAX_REFUTATION_PLIES);
    list.push({
      san: candidate.san,
      kind: candidate.kind,
      does: boardFacts(candidate.fenBefore, candidate.san),
      refutation,
      after: boardFacts(candidate.fen, answer.moveSan),
      captures: captureWords(candidate.fenBefore, [candidate.san, ...refutation]),
      verdict: lineWords(answer)
    });
    kept.set(candidate.nodeId, list);
  }
  return { ...dossier, nodes: dossier.nodes.map((node) => ({ ...node, tempting: kept.get(node.nodeId) ?? [] })) };
}
