import { parsePgn } from '@freechesscoach/chess-analysis';

export type GameInput = { ok: true; pgn: string } | { ok: false; error: string };

/** A pasted game, checked before the engine starts: one PGN with moves. */
export function readGameInput(text: string): GameInput {
  const pgn = text.trim();
  if (pgn === '') return { ok: false, error: 'Paste a game first.' };
  try {
    const moves = parsePgn(pgn).positions.length - 1;
    return moves > 0 ? { ok: true, pgn } : { ok: false, error: 'I found no moves in that PGN.' };
  } catch {
    return { ok: false, error: 'That is not a game I can read. Check the PGN.' };
  }
}
