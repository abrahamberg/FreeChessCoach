import { Chess } from 'chess.js';

export interface AppendedMove {
  pgn: string;
  fen: string;
  san: string;
  uci: string;
  ply: number;
}

export interface RemovedMove {
  pgn: string;
  fen: string;
}

export interface AppendMoveOptions {
  /** When given, embeds a standard `{[%clk h:mm:ss]}` comment after the SAN
   * token (same convention Lichess/chess.com use) — the wall-clock time the
   * mover took since their previous move on this game. Used for timed
   * play_bot games; omitted, this behaves exactly as before. */
  elapsedMs?: number;
}

/**
 * Applies a single SAN move to a full PGN (headers + movetext), unlike
 * applySanSequence (apply-san-sequence.ts) which replays from a bare FEN and
 * has no headers/PGN text to preserve. Uses chess.js's loadPgn + move so an
 * empty or header-only PGN (no moves yet, e.g. movetext just `*`) works the
 * same as one with existing moves.
 */
export function appendMoveToPgn(
  pgn: string,
  san: string,
  options?: AppendMoveOptions
): AppendedMove | { error: string } {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const move = tryMove(chess, san);
  if (!move) return { error: `Illegal move: ${san}` };

  if (options?.elapsedMs !== undefined) {
    chess.setComment(`[%clk ${formatClock(options.elapsedMs)}]`);
  }

  return {
    pgn: chess.pgn(),
    fen: chess.fen(),
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    ply: chess.history().length
  };
}

/** h:mm:ss, hours unpadded (Lichess/chess.com convention), e.g. `0:01:23` —
 * also used by `annotated-pgn.ts`'s `appendAnnotatedMove`/`buildAnnotatedPgn`,
 * which need the identical `[%clk]` formatting. */
export function formatClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Rewinds a full PGN by one ply via chess.js's `.undo()` — a genuine
 * position rewind (legal-move generation, castling/en-passant rights, etc.
 * all revert), not just trimming the movetext string. Works even when the
 * PGN's last move ended the game (checkmate/stalemate).
 */
export function removeLastMoveFromPgn(pgn: string): RemovedMove | { error: string } {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const undone = chess.undo();
  if (!undone) return { error: 'no move to undo' };

  return { pgn: chess.pgn(), fen: chess.fen() };
}

/** Also used by `annotated-pgn.ts`'s `appendAnnotatedMove`, which needs the
 * identical "illegal move returns null instead of throwing" contract. */
export function tryMove(chess: Chess, san: string): ReturnType<Chess['move']> | null {
  try {
    return chess.move(san);
  } catch {
    return null;
  }
}
