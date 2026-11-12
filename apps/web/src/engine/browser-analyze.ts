import type { EngineEval, EngineLine } from '@freechesscoach/shared';
import { Chess } from 'chess.js';
import type { RawEngineLine, SharedEngineWorker } from './shared-engine-worker.js';

/** The SAN of a principal variation, cut where a move does not apply. */
export function pvUciToSan(fen: string, pvUci: string[]): string[] {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];
  for (const uciMove of pvUci) {
    try {
      const move = chess.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove.slice(4, 5) || undefined });
      sanMoves.push(move.san);
    } catch {
      break;
    }
  }
  return sanMoves;
}

// RawEngineLine.cp/mateIn are relative to whichever side is to move in `fen`
// (raw UCI semantics -- see shared-engine-worker.ts and chess-analysis eval-words.ts's own
// sideToMove conversion). Every other EngineEval/PositionAnalysis in the
// system is white-perspective (services/engine/src/uci.ts's recordInfoLine
// does this same conversion for the native backend), so this has to happen
// before a browser result is packaged up -- otherwise every black-to-move
// position's cp sign is inverted relative to what classify.ts's cpLoss math
// expects.
export function toWhitePerspective(fen: string, value: number | null): number | null {
  if (value === null) return null;
  const sideToMove = fen.split(' ')[1];
  return sideToMove === 'b' ? -value : value;
}

/** One engine line as the rest of the app reads it: SAN, White's side, the
 * whole principal variation kept (the native engine keeps it too,
 * services/engine/src/analyze.ts, and Game Review's notes walk it). */
export function toEngineLine(fen: string, line: RawEngineLine): EngineLine {
  const pvSan = pvUciToSan(fen, line.pvUci);
  return {
    moveUci: line.moveUci,
    moveSan: pvSan[0] ?? line.moveUci,
    pvSan,
    cp: toWhitePerspective(fen, line.cp),
    mateIn: toWhitePerspective(fen, line.mateIn)
  };
}

/** Each position searched on this device, one at a time, `multiPv` lines
 * each; `ply` is the position's index in `fens`. The same shape the native
 * engine's analyze-game answers. */
export async function analyzePositionsInBrowser(worker: SharedEngineWorker, fens: string[], depth: number, multiPv: number): Promise<EngineEval[]> {
  const results: EngineEval[] = [];
  for (const [ply, fen] of fens.entries()) {
    const lines = await worker.analyze({ fen, depth, multiPv });
    results.push({ ply, fen, depth, lines: lines.map((line) => toEngineLine(fen, line)) });
  }
  return results;
}
