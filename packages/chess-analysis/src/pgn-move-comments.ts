import { extractFirstGame } from './pgn.js';
import { toCpWhite } from './win-probability.js';

export interface PgnMoveComment {
  ply: number;
  clockMs: number | null;
  evalCp: number | null;
  /** Thinking time for this move, derived from the gap between this move's
   * clock reading and the same colour's previous one, plus the increment.
   * `null` for a colour's first move in the game (no predecessor to diff
   * against) or whenever either clock reading is missing — never `0`, which
   * would misrepresent "no data" as "an instant move". */
  timeSpentMs: number | null;
}

const CLOCK_TAG = /\[%clk\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]/;
const EVAL_TAG = /\[%eval\s+(#?-?\d+(?:\.\d+)?)\]/;
const TIME_CONTROL_HEADER = /^\[TimeControl\s+"([^"]*)"\]/m;
const MOVE_NUMBER_TOKEN = /^\d+\.+$/;
const RESULT_TOKEN = /^(1-0|0-1|1\/2-1\/2|\*)$/;
const NAG_TOKEN = /^\$\d+$/;

/**
 * Extracts each move's `[%clk]`/`[%eval]` PGN comments straight from the raw
 * string. `parsePgn`'s `stripAnnotations` deliberately deletes every `{...}`
 * comment before chess.js ever sees the text — chess.js must keep receiving
 * stripped text, so this is a second, independent pass over the original PGN
 * rather than a change to that function. Ply-indexed and sparse: a move with
 * no comment simply has no entry, never a guessed positional default.
 */
export function extractPgnMoveComments(pgn: string): PgnMoveComment[] {
  const firstGame = extractFirstGame(pgn);
  const commentTextByPly = collectCommentTextByPly(stripHeaderLines(firstGame));
  const incrementMs = parseIncrementMs(firstGame);

  const parsed = [...commentTextByPly.entries()]
    .map(([ply, text]) => ({ ply, clockMs: parseClockMs(text), evalCp: parseEvalCp(text) }))
    .filter((entry) => entry.clockMs !== null || entry.evalCp !== null)
    .sort((a, b) => a.ply - b.ply);

  const lastClockByMover = new Map<'white' | 'black', number>();
  return parsed.map(({ ply, clockMs, evalCp }) => {
    const mover = ply % 2 === 1 ? 'white' : 'black';
    const previousClockMs = lastClockByMover.get(mover);
    const timeSpentMs =
      clockMs !== null && previousClockMs !== undefined ? previousClockMs + incrementMs - clockMs : null;
    if (clockMs !== null) lastClockByMover.set(mover, clockMs);
    return { ply, clockMs, evalCp, timeSpentMs };
  });
}

function stripHeaderLines(pgn: string): string {
  return pgn
    .split('\n')
    .filter((line) => !/^\s*\[.*\]\s*$/.test(line))
    .join('\n');
}

/**
 * Walks the movetext once, tracking comment/variation nesting the same way
 * `pgn.ts`'s `stripAnnotations` does, but — instead of discarding comments —
 * accumulates each top-level `{...}` comment's text against the ply of the
 * mainline move it most recently followed. Text inside a variation is never
 * attributed to anything: it describes a different, hypothetical line.
 */
function collectCommentTextByPly(movetext: string): Map<number, string> {
  const commentsByPly = new Map<number, string>();
  let ply = 0;
  let token = '';
  let commentDepth = 0;
  let variationDepth = 0;
  let commentText = '';

  const flushToken = () => {
    if (token && !MOVE_NUMBER_TOKEN.test(token) && !RESULT_TOKEN.test(token) && !NAG_TOKEN.test(token)) ply += 1;
    token = '';
  };
  const flushComment = () => {
    if (ply > 0) commentsByPly.set(ply, `${commentsByPly.get(ply) ?? ''} ${commentText}`);
    commentText = '';
  };

  for (const character of movetext) {
    if (commentDepth > 0) {
      if (character === '{') commentDepth += 1;
      else if (character === '}') {
        commentDepth -= 1;
        if (commentDepth === 0) flushComment();
      } else commentText += character;
      continue;
    }
    if (variationDepth > 0) {
      if (character === '(') variationDepth += 1;
      else if (character === ')') variationDepth -= 1;
      continue;
    }
    if (character === '{') {
      flushToken();
      commentDepth = 1;
      continue;
    }
    if (character === '(') {
      flushToken();
      variationDepth = 1;
      continue;
    }
    if (/\s/.test(character)) {
      flushToken();
      continue;
    }
    token += character;
  }
  flushToken();

  return commentsByPly;
}

function parseClockMs(text: string): number | null {
  const match = CLOCK_TAG.exec(text);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return Math.round((Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000);
}

function parseEvalCp(text: string): number | null {
  const match = EVAL_TAG.exec(text);
  if (!match) return null;
  const raw = match[1]!;
  if (raw.startsWith('#')) return toCpWhite({ cp: null, mateIn: Number(raw.slice(1)) });
  return toCpWhite({ cp: Math.round(Number(raw) * 100), mateIn: null });
}

function parseIncrementMs(pgn: string): number {
  const match = TIME_CONTROL_HEADER.exec(pgn);
  const increment = match?.[1]?.split('+')[1];
  const seconds = increment === undefined ? 0 : Number(increment);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}
