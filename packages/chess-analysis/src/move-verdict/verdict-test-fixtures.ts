import { Chess } from 'chess.js';
import type { ClassifiedMoveDto, EngineEval, EngineLine, MoveQuality } from '@freechesscoach/shared';
import { toCpWhite } from '../win-probability.js';
import type { MoveVerdictInput } from './types.js';

/**
 * Test positions for `decideMoveVerdict`. Every move and PV is replayed with
 * chess.js on construction, so an illegal fixture throws instead of
 * silently testing nothing. Scores are White-perspective, as stored.
 */
export type Score = number | { mate: number };

/** An engine line from `fen`: `pv[0]` is the move, the rest its PV. */
export function line(fen: string, pv: string[], score: Score): EngineLine {
  const board = new Chess(fen);
  const replay = pv.map((san) => board.move(san));
  const first = replay[0];
  if (!first) throw new Error('empty pv');
  const mate = typeof score === 'number' ? null : score.mate;
  return {
    moveUci: `${first.from}${first.to}`,
    moveSan: first.san,
    cp: typeof score === 'number' ? score : null,
    mateIn: mate,
    pvSan: replay.map((move) => move.san)
  };
}

export interface ScenarioSpec {
  fen: string;
  ply?: number;
  moveSan: string;
  quality: MoveQuality;
  /** Lines at `fen`, best first, as `[pv, score]`. */
  before: [string[], Score][];
  /** Lines after the move (opponent to move), best first. */
  after: [string[], Score][];
  /** Build the opponent's reply from the first `after` line. */
  withNext?: boolean;
}

export function scenario(spec: ScenarioSpec): MoveVerdictInput {
  const ply = spec.ply ?? 1;
  const board = new Chess(spec.fen);
  const played = board.move(spec.moveSan);
  const fenAfter = board.fen();
  const beforeLines = spec.before.map(([pv, score]) => line(spec.fen, pv, score));
  const afterLines = spec.after.map(([pv, score]) => line(fenAfter, pv, score));
  const evals = evalsAround(ply, [spec.fen, beforeLines], [fenAfter, afterLines]);

  const move = classified({
    ply,
    moveSan: played.san,
    uci: `${played.from}${played.to}`,
    mover: played.color === 'w' ? 'white' : 'black',
    quality: spec.quality,
    fenBefore: spec.fen,
    fenAfter,
    cpBefore: scoreOf(beforeLines[0]),
    cpAfter: scoreOf(afterLines[0])
  });
  return { move, evals, previous: null, ...(spec.withNext ? { next: replyTo(move, afterLines) } : {}) };
}

function replyTo(move: ClassifiedMoveDto, afterLines: EngineLine[]): ClassifiedMoveDto {
  const reply = afterLines[0];
  if (!reply || !move.fenAfter) throw new Error('no reply line');
  const board = new Chess(move.fenAfter);
  const played = board.move(reply.moveSan);
  return classified({
    ply: move.ply + 1,
    moveSan: played.san,
    uci: `${played.from}${played.to}`,
    mover: move.mover === 'white' ? 'black' : 'white',
    quality: 'best',
    fenBefore: move.fenAfter,
    fenAfter: board.fen(),
    cpBefore: scoreOf(reply),
    cpAfter: scoreOf(reply)
  });
}

function evalsAround(ply: number, before: [string, EngineLine[]], after: [string, EngineLine[]]): EngineEval[] {
  const filler = (index: number): EngineEval => ({ ply: index, fen: before[0], depth: 18, lines: [] });
  const evals = Array.from({ length: ply - 1 }, (_, index) => filler(index));
  evals.push({ ply: ply - 1, fen: before[0], depth: 18, lines: before[1] });
  evals.push({ ply, fen: after[0], depth: 18, lines: after[1] });
  return evals;
}

function scoreOf(engineLine: EngineLine | undefined): number {
  if (!engineLine) throw new Error('missing line');
  return toCpWhite(engineLine);
}

function classified(fields: Partial<ClassifiedMoveDto> & Pick<ClassifiedMoveDto, 'ply' | 'moveSan' | 'mover' | 'quality'>): ClassifiedMoveDto {
  return {
    isUserMove: true,
    cpLoss: 0,
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    isTacticalPosition: true,
    ...fields
  };
}

/** Nd6+ forks the king on e8 and the rook on b7. */
export const ROOK_FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
/** Nd6+ forks the king on e8 and the bishop on b7; White also has a queen. */
export const BISHOP_FORK_FEN = '4k3/1b6/8/8/2N5/8/8/K2Q4 w - - 0 1';
/** Nxc6 takes a knight and opens the d-file to Rxd1. */
export const QUEEN_FOR_KNIGHT_FEN = '3r2k1/5ppp/2n5/8/3N4/2P5/5PPK/3Q4 w - - 0 1';
/** Qxa4 grabs a rook and leaves e1 to Re1#. */
export const BAIT_ROOK_FEN = '4r1k1/5ppp/8/8/r7/8/5PPP/3Q2K1 w - - 0 1';
/** Re8# is mate; the bishop on b1 attacks the queen on c2. */
export const MATE_OR_QUEEN_FEN = '7k/6pp/8/8/8/8/P1Q2PPP/1b2R1K1 w - - 0 1';
/** Black threatens Re1#; h3 makes luft. */
export const BACK_RANK_FEN = '4r1k1/1p3ppp/8/8/3Q4/8/P4PPP/6K1 w - - 0 1';
/** The Greek gift after 1.e4 e6 2.d4 d5 3.Nc3 Nf6 4.e5 Nfd7 5.Nf3 c5
 * 6.Bd3 Nc6 7.O-O Be7 8.Re1 O-O. */
export const GREEK_GIFT_FEN = 'r1bq1rk1/pp1nbppp/2n1p3/2ppP3/3P4/2NB1N2/PPP2PPP/R1BQR1K1 w - - 6 9';
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
