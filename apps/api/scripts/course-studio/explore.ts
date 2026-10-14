import { moveLabel, positionWords, sideToMove } from '@freechesscoach/chess-analysis';
import type { EngineEval } from '@freechesscoach/shared';
import { Chess } from 'chess.js';
import type { EngineBackend } from '../../src/services/engine/engine-backend.js';
import { playLine } from '../review-audit/oracle.js';
import { probe } from '../review-audit/probe.js';

export interface ExploreOptions {
  engine: EngineBackend;
  engineUrl: string;
  fen: string;
  moves: string[];
  depth: number;
  lines: number;
  replies: boolean;
}

/** Above this many legal moves, `--replies` keeps the forcing ones and the engine's own. */
const EVERY_REPLY_UP_TO = 12;
const ANSWER_PLIES = 6;

/** A position for whoever writes a course's PGN: the review audit's probe
 * (board, attackers, the engine's lines), and with `replies` every move the
 * side to move has, each with the engine's verdict and answer. */
export async function explore(options: ExploreOptions): Promise<string> {
  const text = await probe({ engineUrl: options.engineUrl, fen: options.fen, moves: options.moves, depth: options.depth, lines: options.lines });
  const { fens, legal } = playLine(options.fen, options.moves);
  const fen = fens.at(-1);
  if (!options.replies || !legal || !fen || new Chess(fen).isGameOver()) return text;
  return `${text}\n\n${await repliesText(options, fen)}`;
}

async function repliesText(options: ExploreOptions, fen: string): Promise<string> {
  const board = new Chess(fen);
  const all = board.moves({ verbose: true });
  const every = board.inCheck() || all.length <= EVERY_REPLY_UP_TO;
  const ranked = every ? [] : (await options.engine.analyzePosition(fen, { depth: options.depth, multiPv: options.lines })).lines.map((line) => line.moveSan);
  const kept = all.filter((move) => every || move.captured !== undefined || move.san.endsWith('+') || move.san.endsWith('#') || ranked.includes(move.san));
  const open = kept.filter((move) => !new Chess(move.after).isGameOver());
  const evals = new Map<string, EngineEval>();
  (await options.engine.analyzeGame(open.map((move) => move.after), { depth: options.depth, multiPv: 1 })).forEach((evaluation, index) => {
    const move = open[index];
    if (move) evals.set(move.after, evaluation);
  });
  const mover = sideToMove(fen) === 'white' ? 1 : -1;
  const rows = kept
    .map((move) => ({ move, evaluation: evals.get(move.after), score: mover * whiteScore(move.after, evals.get(move.after)) }))
    .sort((a, b) => b.score - a.score)
    .map(({ move, evaluation }) => {
      const answer = evaluation?.lines[0];
      const pv = (answer?.pvSan?.length ? answer.pvSan : answer ? [answer.moveSan] : []).slice(0, ANSWER_PLIES);
      return `  ${numbered(fen, [move.san, ...pv])}  — ${positionWords(move.after, evaluation)}`;
    });
  const left = all.length - kept.length;
  const head = board.inCheck() ? 'every way out of the check' : every ? 'every legal move' : `the checks, the captures and the engine's top ${options.lines} (${left} quiet ${left === 1 ? 'move' : 'moves'} left out)`;
  return [`replies (${head}; best for the mover first; the move, then the engine's answer):`, ...rows].join('\n');
}

/** White's view; a mate outranks any score, a quicker one a slower one. */
function whiteScore(fen: string, evaluation: EngineEval | undefined): number {
  const board = new Chess(fen);
  if (board.isCheckmate()) return board.turn() === 'w' ? -1_000_000 : 1_000_000;
  const line = evaluation?.lines[0];
  if (!line) return 0;
  if (line.mateIn !== null) return Math.sign(line.mateIn) * (100_000 - Math.abs(line.mateIn));
  return line.cp ?? 0;
}

/** "7.Ke2 Bg4+ 8.Kxf2 Bxd1": ready to paste as a PGN variation. */
export function numbered(fen: string, sans: readonly string[]): string {
  const board = new Chess(fen);
  const parts: string[] = [];
  for (const [index, san] of sans.entries()) {
    const before = board.fen();
    try {
      board.move(san);
    } catch {
      break;
    }
    parts.push(index === 0 || sideToMove(before) === 'white' ? moveLabel(before, san, '...') : san);
  }
  return parts.join(' ');
}
