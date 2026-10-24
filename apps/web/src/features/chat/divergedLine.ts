import { moveRefToPly } from '@freechesscoach/chess-analysis';
import { describePly } from './positionDivider.js';

export interface DivergedMoveSan {
  san: string;
}

export interface DivergedLineState {
  basePly: number;
  baseFen: string;
  /** `nodeId` is the move's node in the session's move tree, to find the engine's verdict on it. */
  moves: { nodeId: string; san: string; fen: string; uci: string }[];
}

/**
 * Standard PGN move-pair rendering continuing from an arbitrary basePly
 * (not always ply 0, unlike a game's annotated PGN) — "1.e4 e5 2.Nf3" from
 * the start, or "1...e5 2.Nf3" when the sequence's first move is black's
 * (basePly itself is a white move, i.e. odd).
 */
export function formatDivergedSanSequence(basePly: number, moves: DivergedMoveSan[]): string {
  return moves
    .map((move, index) => {
      const { moveNumber, color } = describePly(basePly + index + 1);
      if (color === 'white') return `${moveNumber}.${move.san}`;
      if (index === 0) return `${moveNumber}...${move.san}`;
      return move.san;
    })
    .join(' ');
}

const START_PREFIX = '[diverged_line_start]';
const LINE_PREFIX = '[diverged_line]';
const LINE_PATTERN =
  /^\[diverged_line\] Exploring from move (\d+) \((white|black)\): (.+) \(position now: ([^)]+)\): ([\s\S]*)$/;

export interface DivergedLineSan {
  basePly: number;
  sanMoves: string[];
  resultFen: string;
}

/** Client-synthesized announcement when hypothetical_line resolves —
 * assistant-authored, never re-sent to the coach — same JSON-after-prefix
 * pattern as encodeAnnotationNote. */
export function encodeDivergedLineStart(data: DivergedLineSan): string {
  return `${START_PREFIX}|${JSON.stringify(data)}`;
}

export function decodeDivergedLineStart(text: string): DivergedLineSan | null {
  if (!text.startsWith(`${START_PREFIX}|`)) return null;
  try {
    return JSON.parse(text.slice(START_PREFIX.length + 1)) as DivergedLineSan;
  } catch {
    return null;
  }
}

/** Where the app's own review of the line starts in a message: after the
 * student's words, so the transcript can show the words alone. */
const LINE_REVIEW_MARK = '\n\n[line_review] ';

/** The student's submitted diverged line + optional commentary — becomes
 * the actual user turn sent to the coach, human-readable like [board_move]/
 * [position_context], e.g. "[diverged_line] Exploring from move 26 (white):
 * 26.a3 f6 27.a4 (position now: <fen>): <content>". `dossier` is the app's
 * engine dossier on each move of the line (POST /api/positions/line-dossier,
 * the notes the coach reads for a move of the game); it follows as a
 * "[line_review]" block that says outright this is an alternative path being
 * explored, so the coach never takes the moves for the game. The app sends it
 * with every message for as long as the line is on the board. */
export function encodeDivergedLine(line: DivergedLineState, content: string, dossier: string | null = null): string {
  const { moveNumber, color } = describePly(line.basePly + 1);
  const sanText = formatDivergedSanSequence(line.basePly, line.moves);
  const resultFen = line.moves.at(-1)?.fen ?? line.baseFen;
  const review = dossier ? `${LINE_REVIEW_MARK}This is an ALTERNATIVE PATH the student is exploring on the board, not the real game: none of these moves were played. The app's engine dossier on each move of it, the same notes you get for a move of the game:\n\n${dossier}` : '';
  return `${LINE_PREFIX} Exploring from move ${moveNumber} (${color}): ${sanText} (position now: ${resultFen}): ${content}${review}`;
}

export function decodeDivergedLine(
  text: string
): { basePly: number; sanText: string; resultFen: string; content: string } | null {
  const match = LINE_PATTERN.exec(text);
  if (!match) return null;
  const [, moveNumber, color, sanText, resultFen, rest] = match;
  const basePly = moveRefToPly(Number(moveNumber), color as 'white' | 'black') - 1;
  // The transcript shows what the student wrote, not the app's review block.
  const content = (rest ?? '').split(LINE_REVIEW_MARK)[0] ?? '';
  return { basePly, sanText: sanText ?? '', resultFen: resultFen ?? '', content };
}
