import { Chess } from 'chess.js';
import type { ClassifiedMoveDto, DiagnosisCodeId } from '@freechesscoach/shared';
import { plyToMoveRef } from './move-ref.js';
import { commentTextByPlyOf } from './pgn-move-comments.js';
import { parsePgn } from './pgn.js';
import type { AppendMoveOptions, AppendedMove } from './pgn-mutation.js';

/**
 * Everything a `ClassifiedMoveDto` carries that isn't already reconstructible
 * by replaying the PGN mainline — `ply`/`moveNumber`/`mover` come from the
 * move's position in the movetext (`plyToMoveRef`), `moveSan`/`uci`/
 * `fenBefore`/`fenAfter` from chess.js's own replay, `isUserMove` from
 * comparing `mover` against the game's `userColor` (a fact about the game,
 * not the move). This is the payload one move's `[%fcc ...]` comment tag
 * carries — see `docs/architecture.md`'s "Analysis storage" note.
 */
export type AnnotatedMoveData = Omit<
  ClassifiedMoveDto,
  'ply' | 'moveNumber' | 'moveSan' | 'uci' | 'mover' | 'isUserMove' | 'fenBefore' | 'fenAfter'
> & {
  /** Not part of `ClassifiedMoveSchema` — a live-play-only tag (the real
   * diagnostics registry's read of a bot's own move, docs/plan.md Phase 62
   * Task 62.4; see `services/play-move-quality.ts`'s `classifyAndRecordMove`
   * and its `computeDiagnosisCodes` option). Carried here so play mode's
   * per-move annotation has everywhere `game_move_qualities.diagnosisCodes`
   * used to live. `[]`/omitted for every non-bot move. */
  diagnosisCodes?: DiagnosisCodeId[];
};

const ANNOTATION_TAG = /\[%fcc ([^\]]+)\]/;

const DERIVABLE_FIELDS = ['ply', 'moveNumber', 'moveSan', 'uci', 'mover', 'isUserMove', 'fenBefore', 'fenAfter'] as const;

/** Strips the fields `parseAnnotatedPgn` reconstructs from the mainline
 * itself, so a move's `[%fcc ...]` comment carries only what replay can't
 * recover — `moveSan`/`fenBefore`/`fenAfter` included, which would otherwise
 * double the size of every annotated PGN for no benefit (both callers,
 * `services/analysis.ts` and `services/play-move-quality.ts`, already have
 * a `ClassifiedMoveDto` in hand with those fields filled in from the same
 * replay this module itself does). `diagnosisCodes` (not part of
 * `ClassifiedMoveSchema`) passes through untouched when present. */
export function toAnnotatedMoveData(move: ClassifiedMoveDto & { diagnosisCodes?: DiagnosisCodeId[] }): AnnotatedMoveData {
  const data = { ...move };
  for (const field of DERIVABLE_FIELDS) delete data[field];
  return data as AnnotatedMoveData;
}

/** Percent-encoding, not base64: dependency-free and identical in both
 * Node (api/worker) and the browser (`apps/web` imports this package
 * directly) — unlike `Buffer`, which only exists in Node. The encoded
 * output only ever contains `A-Za-z0-9-_.!~*'()%`, never `{`, `}`, `[`, `]`,
 * or whitespace, so it can't be confused with PGN comment/bracket
 * delimiters or terminate the tag's own `[^\]]+` scan early — the JSON
 * payload commonly contains `]` itself (e.g. `bestLineSan` is an array). */
export function encodeMoveComment(data: AnnotatedMoveData): string {
  return `[%fcc ${encodeURIComponent(JSON.stringify(data))}]`;
}

/** Returns `null` (never throws) for a comment with no `[%fcc]` tag, or one
 * whose payload doesn't parse — a garbled/foreign comment is a reason to
 * treat this ply as unannotated, not to fail the whole game's read. */
export function decodeMoveComment(commentText: string): AnnotatedMoveData | null {
  const match = ANNOTATION_TAG.exec(commentText);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]!)) as AnnotatedMoveData;
  } catch {
    return null;
  }
}

/**
 * Same contract as `pgn-mutation.ts`'s `appendMoveToPgn`, plus embedding
 * `data`'s annotation (when given) as that move's `[%fcc ...]` comment tag —
 * alongside an `[%clk]` tag from `options.elapsedMs`, same as that function,
 * in the *same* comment (chess.js comments are one string per move, so both
 * tags are set together in one `setComment` call rather than two, which
 * would silently overwrite each other). `data: null` appends a bare move
 * with no annotation — the live-play "move just committed, not yet
 * classified" case, or replaying an opponent's move.
 */
export function appendAnnotatedMove(
  pgn: string,
  san: string,
  data: AnnotatedMoveData | null,
  options?: AppendMoveOptions
): AppendedMove | { error: string } {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const move = tryMove(chess, san);
  if (!move) return { error: `Illegal move: ${san}` };

  const comment = buildCommentText(data, options?.elapsedMs);
  if (comment) chess.setComment(comment);

  return {
    pgn: chess.pgn(),
    fen: chess.fen(),
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    ply: chess.history().length
  };
}

/**
 * Builds a whole annotated PGN in one pass from a plain PGN (headers +
 * mainline, no `[%fcc]` comments yet) and a per-ply annotation map — the
 * batch analysis job's use (services/analysis.ts): the classifier already
 * produces the full `ClassifiedMoveDto[]` for a game at once, so this avoids
 * O(plies) repeated `loadPgn` reparsing that calling `appendAnnotatedMove`
 * in a loop would cost. A ply with no entry in `movesData` is written bare
 * (no comment) — every existing ply keeps whatever `[%clk]`/`[%eval]`
 * comment the source PGN already carried, since this replays through
 * chess.js's own `loadPgn`/`history`, not a hand-rebuilt movetext string.
 */
export function buildAnnotatedPgn(pgn: string, movesData: ReadonlyMap<number, AnnotatedMoveData>): string {
  const source = new Chess();
  source.loadPgn(pgn);
  const headers = source.getHeaders();
  const verboseMoves = source.history({ verbose: true });

  const parsed = parsePgn(pgn);
  const startFen = parsed.positions[0]!.fen;
  const chess = new Chess(startFen);
  for (const [key, value] of Object.entries(headers)) {
    if (value) chess.header(key, value);
  }

  verboseMoves.forEach((verboseMove, index) => {
    const ply = index + 1;
    chess.move({ from: verboseMove.from, to: verboseMove.to, promotion: verboseMove.promotion });
    const data = movesData.get(ply) ?? null;
    const comment = buildCommentText(data, undefined);
    if (comment) chess.setComment(comment);
  });

  return chess.pgn();
}

/**
 * Reads an annotated PGN back into `ClassifiedMoveDto[]` — the read side of
 * `buildAnnotatedPgn`/`appendAnnotatedMove`. Reuses `parsePgn` for the
 * mainline (ply/fen/moveSan/mover, and correct handling of a `[FEN]`/
 * `[SetUp]` custom start) and `commentTextByPlyOf` for the raw per-ply
 * comment text, same primitive `pgn-move-comments.ts`'s `[%clk]`/`[%eval]`
 * extraction already uses. A ply with no `[%fcc]` tag (never analyzed, or a
 * live move not yet classified) still yields a move — just without the
 * optional analysis fields.
 */
export function parseAnnotatedPgn(pgn: string, userColor: 'white' | 'black'): ClassifiedMoveDto[] {
  const parsed = parsePgn(pgn);
  const commentTextByPly = commentTextByPlyOf(pgn);

  return parsed.positions.slice(1).map((position) => {
    const { moveNumber, color } = plyToMoveRef(position.ply);
    const data = decodeMoveComment(commentTextByPly.get(position.ply) ?? '');
    return {
      ...(data ?? {}),
      ply: position.ply,
      moveNumber,
      moveSan: position.moveSan!,
      uci: position.moveUci ?? undefined,
      mover: color!,
      isUserMove: color === userColor,
      fenBefore: parsed.positions[position.ply - 1]!.fen,
      fenAfter: position.fen
    } as ClassifiedMoveDto;
  });
}

function buildCommentText(data: AnnotatedMoveData | null, elapsedMs: number | undefined): string | null {
  const parts: string[] = [];
  if (elapsedMs !== undefined) parts.push(`[%clk ${formatClock(elapsedMs)}]`);
  if (data) parts.push(encodeMoveComment(data));
  return parts.length > 0 ? parts.join(' ') : null;
}

/** h:mm:ss, hours unpadded (Lichess/chess.com convention) — mirrors
 * `pgn-mutation.ts`'s own `formatClock`, duplicated rather than imported to
 * keep that module untouched (its existing callers/tests are unaffected by
 * this one). */
function formatClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function tryMove(chess: Chess, san: string): ReturnType<Chess['move']> | null {
  try {
    return chess.move(san);
  } catch {
    return null;
  }
}
