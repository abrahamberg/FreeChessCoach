import { Chess, type PieceSymbol } from 'chess.js';
import type { CourseEpisode } from '@freechesscoach/shared';
import type { CourseVerifyProblem } from './verify.js';
import type { EpisodeScope } from './verify-scope.js';
import { sameMove, sanTokens, type EpisodeText } from './verify-text.js';

const PIECES: Record<string, PieceSymbol> = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };
// "the knight on d5", "pawns on e4", "the f6-knight" or "your d1 bishop".
const ON_SQUARE = /\b(king|queen|rook|bishop|knight|pawn)s? on ([a-h][1-8])\b|\b([a-h][1-8])[- ](king|queen|rook|bishop|knight|pawn)\b/gi;

/**
 * A piece a line puts on a square stands there in a position the line is
 * about: the episode's positions, the lines its moves show (the better move,
 * the tempting moves, the safe line). A safety episode's line on the bait is
 * about the position before the bait and the safe line, and after the bait
 * only where it names the bait ("not 6.Bc3: the bishop on c3…"): two runs
 * had "keeps the knight on d5 safe" after 6.e3, with the knight on c3. The
 * hook promises the line's end and is not checked.
 */
export function pieceProblems(episode: CourseEpisode, texts: EpisodeText[], scope: EpisodeScope): CourseVerifyProblem[] {
  if (episode.role === 'hook') return [];
  const fens = episodeFens(episode, scope);
  return texts.flatMap(({ where, nodeId, text }) => {
    const shown = [...fens, ...(episode.role === 'safety' ? baitAfter(episode, scope, text) : [])];
    const standsOn = (piece: PieceSymbol, square: string): boolean => shown.some((fen) => new Chess(fen).get(square as never)?.type === piece);
    return [...text.matchAll(ON_SQUARE)].flatMap((match) => {
      const name = (match[1] ?? match[4] ?? '').toLowerCase();
      const square = (match[2] ?? match[3] ?? '').toLowerCase();
      const piece = PIECES[name];
      if (!piece || standsOn(piece, square)) return [];
      return [{ code: 'pieces' as const, nodeId, message: `"${match[0]}" in ${where}: no ${name} stands on ${square} in the positions this line is about` }];
    });
  });
}

/** The position after each move of a safety episode that the text names. */
function baitAfter(episode: CourseEpisode, scope: EpisodeScope, text: string): string[] {
  const named = new Set(sanTokens(text).flatMap(sameMove));
  return scope.path.filter((nodeId) => sameMove(scope.byId.get(nodeId)?.san ?? '').some((form) => named.has(form))).map((nodeId) => scope.byId.get(nodeId)?.fenAfter ?? '');
}

function episodeFens(episode: CourseEpisode, scope: EpisodeScope): string[] {
  const safety = episode.role === 'safety';
  const fens = scope.path.flatMap((nodeId) => [scope.fenBefore(nodeId), ...(safety ? [] : [scope.byId.get(nodeId)?.fenAfter ?? ''])]);
  if (episode.quiz) fens.push(scope.fenBefore(episode.quiz.answerNodeId), scope.byId.get(episode.quiz.answerNodeId)?.fenAfter ?? '');
  for (const ply of episode.plies) {
    const before = scope.fenBefore(ply.nodeId);
    const best = scope.facts.get(ply.nodeId)?.bestInstead?.line ?? [];
    for (const line of [best, ply.playOut ?? [], ...(ply.tempting ?? []).map((each) => [each.san, ...(each.refutation ?? [])])]) fens.push(...positionsAlong(before, line));
  }
  return fens.filter(Boolean);
}

/** The positions after each move of a line from `fen`, while it is legal. */
function positionsAlong(fen: string, sans: readonly string[]): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const san of sans) {
    try {
      chess.move(san);
    } catch {
      break;
    }
    out.push(chess.fen());
  }
  return out;
}
