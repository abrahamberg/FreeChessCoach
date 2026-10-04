import { Chess, type Square } from 'chess.js';
import { NativeEngineBackend } from '../../src/services/engine/native-engine-backend.js';
import { attackersOf, balance, exchangeGain, other, playLine } from './oracle.js';
import { linesText } from './render.js';

export interface ProbeOptions {
  engineUrl: string;
  fen: string;
  moves: string[];
  depth: number;
}

const NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** A judge's calculator: the board after some moves, who attacks and
 * defends each piece, what taking it wins, and the engine's lines. */
export async function probe(options: ProbeOptions): Promise<string> {
  const { fens, legal } = playLine(options.fen, options.moves);
  const fen = fens[fens.length - 1] ?? options.fen;
  const chess = new Chess(fen);
  const rows = [
    legal ? `after ${options.moves.join(' ') || '(no moves)'}:` : `ILLEGAL: stopped after ${fens.length - 1} of ${options.moves.length} moves (${options.moves[fens.length - 1]} is not legal)`,
    chess.ascii(),
    `fen: ${fen}`,
    `to move: ${chess.turn() === 'w' ? 'White' : 'Black'}${chess.isCheckmate() ? ' — CHECKMATE' : chess.inCheck() ? ' — in check' : ''}${chess.isStalemate() ? ' — STALEMATE' : ''}`,
    `material (White minus Black, pawns): ${balance(fen)}`,
    `material change over the moves: ${balance(fen) - balance(options.fen)} for White`,
    '',
    'pieces (attackers / defenders; what taking it wins over the whole exchange):'
  ];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.type === 'k') continue;
      const attackers = attackersOf(fen, cell.square, other(cell.color));
      const defenders = attackersOf(fen, cell.square, cell.color);
      if (!attackers.length) continue;
      rows.push(`  ${cell.color === 'w' ? 'White' : 'Black'} ${NAMES[cell.type]} ${cell.square}: attacked by ${attackers.map((square) => pieceName(chess, square)).join(', ')}; defended by ${defenders.map((square) => pieceName(chess, square)).join(', ') || 'nothing'}; taking it wins ${exchangeGain(fen, cell.square, other(cell.color))}`);
    }
  }
  const moves = chess.moves({ verbose: true });
  rows.push('', `legal moves: ${moves.map((move) => move.san).join(' ') || 'none'}`);
  if (!chess.isGameOver()) {
    const analysis = await new NativeEngineBackend(options.engineUrl).analyzePosition(fen, { depth: options.depth, multiPv: 3 });
    const lines = analysis.lines.map((line) => ({ san: line.moveSan, cp: line.cp, mate: line.mateIn, pv: line.pvSan.slice(0, 12) }));
    rows.push(`engine depth ${analysis.reachedDepth ?? analysis.depth}${analysis.reachedDepth && analysis.reachedDepth < analysis.depth ? ` (asked for ${analysis.depth}; stopped by the engine's time limit)` : ''} (White's view): ${linesText(lines)}`);
  }
  return rows.join('\n');
}

function pieceName(chess: Chess, square: string): string {
  const piece = chess.get(square as Square);
  return piece ? `${NAMES[piece.type]} ${square}` : square;
}
