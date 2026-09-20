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

/** A White-perspective engine score — the same convention as
 * `EngineLine.cp`/`mateIn` and the PGN `[%eval]` tag (positive favours White). */
export interface EvalScore {
  cp: number | null;
  mateIn: number | null;
}

const EVAL_TAG_ANYWHERE = /\[%eval\s+[^\]]*\]/g;

/** The standard PGN `[%eval]` comment tag (pawns, or `#N` for mate) — the one
 * `extractPgnMoveComments` already reads back as `evalCp`, so an eval saved
 * with a move shows up wherever imported games' evals do. */
export function formatEvalTag(score: EvalScore): string {
  if (score.mateIn !== null) return `[%eval #${score.mateIn}]`;
  return `[%eval ${((score.cp ?? 0) / 100).toFixed(2)}]`;
}

/** A move's comment text: its clock (when the game is timed) and the engine's
 * eval of the position it left behind (when known). Null when neither is. */
export function buildMoveCommentParts(options: AppendMoveOptions | undefined): string[] {
  const parts: string[] = [];
  if (options?.elapsedMs !== undefined) parts.push(`[%clk ${formatClock(options.elapsedMs)}]`);
  if (options?.evalAfter) parts.push(formatEvalTag(options.evalAfter));
  return parts;
}

export interface AppendMoveOptions {
  /** The engine's eval of the position AFTER this move, saved in its
   * `[%eval]` comment so returning to the position (undo, a resumed game,
   * the eval graph) never has to ask the engine again. */
  evalAfter?: EvalScore;
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

  const commentParts = buildMoveCommentParts(options);
  if (commentParts.length > 0) chess.setComment(commentParts.join(' '));

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
 * Sets (or replaces) the `[%eval]` tag on the game's LAST move, keeping the
 * rest of its comment (`[%clk]`, `[%fcc]`). A move is saved before anyone knows
 * the eval of the position it leaves — the student's move is evaluated by the
 * bot's own search a moment later — so the eval is written afterwards. Like
 * `replaceLastMoveAnnotation`, it only ever touches the last move, and a
 * mismatch with the SAN the caller expects (an undo raced it) is an error, not a
 * write to the wrong move.
 */
export function setLastMoveEval(pgn: string, expectedSan: string, score: EvalScore): { pgn: string } | { error: string } {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const last = chess.history().at(-1);
  if (last === undefined) return { error: 'No moves to evaluate' };
  if (last !== expectedSan) return { error: `Last move is ${last}, not ${expectedSan}` };

  const kept = (chess.getComment() ?? '').replace(EVAL_TAG_ANYWHERE, '').trim();
  chess.setComment([kept, formatEvalTag(score)].filter(Boolean).join(' '));
  return { pgn: chess.pgn() };
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
