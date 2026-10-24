import { Chess } from 'chess.js';
import { parsePgnTree, type EditableTree } from '@freechesscoach/chess-analysis';

export type ReviewInput = { ok: true; tree: EditableTree } | { ok: false; error: string };

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** What the temporary review opens on: a FEN, a PGN (its variations kept),
 * or nothing for the standard start. Pure; nothing is stored. */
export function readReviewInput(text: string): ReviewInput {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, tree: { startFen: START_FEN, nodes: [], errors: [] } };
  return looksLikeFen(trimmed) ? readFen(trimmed) : readPgn(trimmed);
}

function looksLikeFen(text: string): boolean {
  return !text.includes('[') && !/\d\./.test(text) && text.split('/').length >= 8;
}

function readFen(fen: string): ReviewInput {
  const clean = fen.replace(/\s+/g, ' ');
  try {
    return { ok: true, tree: { startFen: new Chess(clean).fen(), nodes: [], errors: [] } };
  } catch {
    return { ok: false, error: 'That is not a position I can read. Check the FEN.' };
  }
}

function readPgn(pgn: string): ReviewInput {
  const tree = parsePgnTree(pgn);
  const error = tree.errors[0];
  if (error) return { ok: false, error: error.message };
  if (tree.nodes.length === 0) return { ok: false, error: 'I found no moves in that PGN.' };
  return { ok: true, tree };
}
