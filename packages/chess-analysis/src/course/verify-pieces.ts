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

const TAKEN = /\b(?:took|takes|taken|captured|captures|grabbed|grabs)\s+(?:your|the|my|our|their|a|white's|black's)\s+(king|queen|rook|bishop|knight|pawn)\b/gi;

/**
 * On a move that takes back, "took your pawn" names the piece that was just
 * taken there, or the one this move takes: a reel said "White took your pawn.
 * Taking back opens your light-squared bishop" on 4…dxc6, where White had
 * taken the knight. Only the lines on the move itself are checked; a tempting
 * move's "why" and the quiz speak of other positions.
 */
export function takenPieceProblems(texts: EpisodeText[], scope: EpisodeScope): CourseVerifyProblem[] {
  return texts.flatMap(({ where, nodeId, text }) => {
    const node = nodeId ? scope.byId.get(nodeId) : undefined;
    const before = node?.parentId ? scope.byId.get(node.parentId) : undefined;
    if (!node || !before || !/\b(?:line|caption) on\b/.test(where)) return [];
    const taken = captureOf(scope.fenBefore(before.id), before.san);
    const back = captureOf(scope.fenBefore(node.id), node.san);
    if (!taken || !back || taken.square !== back.square) return [];
    return [...text.replace(/’/g, "'").matchAll(TAKEN)].flatMap((match) => {
      const piece = PIECES[match[1]!.toLowerCase()];
      if (piece === taken.piece || piece === back.piece) return [];
      const name = Object.keys(PIECES).find((each) => PIECES[each] === taken.piece);
      return [{ code: 'pieces' as const, nodeId, message: `"${match[0]}" in ${where}: the move before, ${before.san}, took the ${name}, and this move takes back` }];
    });
  });
}

/** The piece a move takes and where; null when it takes nothing or is not legal. */
function captureOf(fen: string, san: string): { piece: PieceSymbol; square: string } | null {
  try {
    const move = new Chess(fen).move(san);
    return move.captured ? { piece: move.captured, square: move.to } : null;
  } catch {
    return null;
  }
}
