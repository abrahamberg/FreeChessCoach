import { Chess, type PieceSymbol } from 'chess.js';
import type { CourseKind, EngineEval, EngineLine } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';
import { moverMateIn } from './dossier-node.js';
import type { CourseDossier } from './dossier.js';
import { threatens } from '../board-facts/threats.js';
import { boardFacts } from '../board-facts/move-facts.js';
import type { BoardFact } from '../board-facts/types.js';
import { cpBand } from '../eval-words.js';
import { lineWords } from '../board-facts/verdict-words.js';
import { captureWords, exchangeLoss, lineBalance, settledLine } from '../board-facts/material.js';
import type { CourseTree } from './tree.js';
import { pieceValueOrKing } from '../tactics.js';
import { toCpWhite, winPctFor } from '../win-probability.js';

const KIND_ORDER = { check: 0, capture: 1, threat: 2 } as const;

export type TemptingKind = keyof typeof KIND_ORDER;

/** docs/courses.md §13.5: a move that looks right and fails, and why. */
export interface CourseTemptingFacts {
  san: string;
  kind: TemptingKind;
  /** What the tempting move itself does on the board, from chess.js. */
  does: BoardFact[];
  /** The engine's answer to it, at most 4 plies. */
  refutation: string[];
  /** What the answer does on the board, from chess.js. */
  after: BoardFact[];
  /** Who takes what over the move and its refutation ("Black takes a pawn;
   * White takes the queen"), so the model never works it out. */
  captures: string;
  /** The position after the tempting move, in the dossier's words. */
  verdict: string;
  /** The material at the refutation's end ("Black is a queen up"). */
  balance: string;
  /** At a solving move, a move that still works: why it is not the answer
   * ("it mates too, but in 5 moves, not 4"; "White is still winning, but
   * there is no mate; the answer mates in 4"). Null when it simply fails. A
   * puzzle asks for the best move, not any move that works. */
  notTheAnswer: string | null;
}

export interface TemptingCandidate {
  nodeId: string;
  san: string;
  kind: TemptingKind;
  /** The position the candidate is played from (the course move's). */
  fenBefore: string;
  /** The position after the candidate: what the engine evaluates. */
  fen: string;
  /** A puzzle's or tactics course's learner move: the solver weighs every
   * check and capture, so each is kept with why it fails. */
  solving: boolean;
}

/**
 * §13.5, before the engine: at every critical node, every quiz answer, and
 * every learner move of a puzzle or tactics course, the checks, captures and
 * threats the side to move could play instead, except the move played and
 * the engine's ranked moves. Checks first, then captures by value taken,
 * then threats; at most 6 a position. Outside a puzzle or tactics course a
 * mating move gets none: two trap runs listed Nxe2? and Ke7? under Nf3#. At
 * a puzzle's or tactics course's learner move the engine's ranked moves are
 * candidates too: "Ng6+ misses the mate" needs its answer, hxg6.
 */
export function temptingCandidates(tree: CourseTree, dossier: CourseDossier, kind: CourseKind | null): TemptingCandidate[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  // An endgame's technique is precise: every move of it is weighed.
  const everyLearnerMove = kind === 'puzzle' || kind === 'tactics' || kind === 'endgame';
  return dossier.nodes.flatMap((facts) => {
    const asked = (facts.critical || facts.quizEligible || (everyLearnerMove && facts.side === dossier.learnerSide)) && (everyLearnerMove || !facts.san.endsWith('#'));
    const node = byId.get(facts.nodeId);
    if (!asked || !node) return [];
    const fenBefore = node.parentId ? (byId.get(node.parentId)?.fenAfter ?? tree.startFen) : tree.startFen;
    const solving = everyLearnerMove && facts.side === dossier.learnerSide;
    const ranked = new Set([facts.san, ...(solving ? [] : [...(facts.bestInstead ? [facts.bestInstead.san] : []), ...facts.alternatives.map((line) => line.san)])]);
    return movesWorthTrying(fenBefore)
      .filter((candidate) => !ranked.has(candidate.san))
      .slice(0, CONFIG.courses.maxTemptingCandidates)
      .map(({ san, kind: moveKind, fen }) => ({ nodeId: facts.nodeId, san, kind: moveKind, fenBefore, fen, solving }));
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
    if (after.isCheckmate() || kingTakesForNothing(after, move)) return [];
    if (move.san.endsWith('+')) return [{ san: move.san, kind: 'check', fen: move.after, value: 0 }];
    if (move.captured) return [{ san: move.san, kind: 'capture', fen: move.after, value: pieceValueOrKing(move.captured) }];
    const threat = threatens(after, move.to, move.piece, move.color);
    return threat ? [{ san: move.san, kind: 'threat', fen: move.after, value: threat }] : [];
  });
  return found.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.value - a.value);
}

/** A queen or rook put where the king just takes it, for at most a pawn:
 * no one is tempted by queen against pawn's Qd1+ Kxd1, and a perpetual's
 * list was five of them a move. A minor piece stays (the Greek gift's
 * Bxh7+ Kxh7 is a real try). */
function kingTakesForNothing(after: Chess, move: { piece: PieceSymbol; to: string; captured?: PieceSymbol }): boolean {
  const given = pieceValueOrKing(move.piece) - (move.captured ? pieceValueOrKing(move.captured) : 0);
  if (given < 4) return false;
  return after.moves({ verbose: true }).some((reply) => reply.piece === 'k' && reply.to === move.to);
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
    const limit = candidate.solving ? CONFIG.courses.maxSolveTempting : CONFIG.courses.maxTempting;
    if (!facts || !best || !answer || list.length >= limit) continue;
    const drop = winPctFor(facts.side, toCpWhite(best)) - winPctFor(facts.side, toCpWhite(answer));
    const walksIntoMate = answer.mateIn !== null && (answer.mateIn > 0) === (facts.side === 'black');
    // The best mates in N; after this candidate, with the other side to
    // move, N - 1 would keep pace. Later or never misses the mate.
    const bestMate = moverMateIn(best, facts.side);
    const answerMate = moverMateIn(answer, facts.side);
    const missesMate = bestMate !== null && (answerMate === null || answerMate >= bestMate);
    // A solver weighs every check and capture: none is too obvious to
    // explain, and a check that is merely worse fails too. One as good as
    // the course move (a mate as fast) is no tempting move.
    const weighed = candidate.solving && candidate.kind !== 'threat';
    const worseCheck = weighed && candidate.kind === 'check' && drop >= CONFIG.courses.solveCheckDrop;
    if (drop < CONFIG.courses.temptingDrop && !walksIntoMate && !missesMate && !worseCheck) continue;
    if (!weighed && exchangeLoss(candidate.fenBefore, candidate.san, answer.moveSan) >= CONFIG.courses.obviousLoss) continue;
    const pv = (answer.pvSan?.length ? answer.pvSan : [answer.moveSan]).slice(0, CONFIG.courses.maxRefutationPlies);
    // Never cut mid-exchange, but always keep the answer itself.
    const refutation = [...pv.slice(0, 1), ...settledLine(candidate.fen, pv).slice(1)];
    list.push({
      san: candidate.san,
      kind: candidate.kind,
      does: boardFacts(candidate.fenBefore, candidate.san),
      refutation,
      after: boardFacts(candidate.fen, answer.moveSan),
      captures: captureWords(candidate.fenBefore, [candidate.san, ...refutation]),
      verdict: lineWords(answer),
      balance: lineBalance(candidate.fenBefore, [candidate.san, ...refutation]),
      notTheAnswer: candidate.solving ? notTheAnswer(facts.side, best, answer) : null
    });
    kept.set(candidate.nodeId, list);
  }
  return { ...dossier, nodes: dossier.nodes.map((node) => ({ ...node, tempting: kept.get(node.nodeId) ?? [] })) };
}

/** Why a move that still works is not the puzzle's answer, from the engine's
 * lines before it (the answer) and after it; null when it does not work: the
 * mover no longer stands better. After the candidate the other side moves,
 * so its mate in K is K + 1 moves from the puzzle's position. */
export function notTheAnswer(side: 'white' | 'black', best: EngineLine, answer: EngineLine): string | null {
  const name = side === 'white' ? 'White' : 'Black';
  const answerMate = moverMateIn(answer, side);
  const bestMate = moverMateIn(best, side);
  const sign = side === 'white' ? 1 : -1;
  const band = answer.mateIn === null ? cpBand(sign * (answer.cp ?? 0)) : null;
  // Still standing better: mates, or is ahead by the band's own margin.
  const stands = answerMate !== null || (answer.mateIn === null && sign * (answer.cp ?? 0) >= 50);
  if (!stands) return null;
  if (bestMate !== null && answerMate !== null) return `it mates too, but in ${answerMate + 1} moves, not ${bestMate}`;
  const still = answerMate !== null ? `${name} has still a forced mate in ${answerMate}` : `${name} is still ${band}`;
  if (bestMate !== null) return `${still}, but there is no mate; the answer mates in ${bestMate}`;
  return `${still}, but the answer is stronger: ${lineWords(best)}`;
}
