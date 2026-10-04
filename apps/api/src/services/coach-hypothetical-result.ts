import { inspectMoves } from '@freechesscoach/chess-analysis';
import { renderEngineAnalysisSummary, renderMoveNote, renderPositionFacts } from '@freechesscoach/prompts';
import { HypotheticalLineResultSchema, type HypotheticalLineResult } from '@freechesscoach/shared';
import type { AnalyzePosition } from './engine/engine-backend.js';

/**
 * The browser only plays a hypothetical line; it knows nothing about what the
 * moves do or how good the position is. Left like that, the coach followed
 * every hypothetical_line with check_moves and get_engine_analysis on the
 * fen it got back — two more tool rounds for facts the server can attach
 * once. This adds, to a result the browser reported, what each move does
 * (`lineFacts`), the board facts at its end, and the engine's verdict there.
 * A result it cannot read is passed through unchanged.
 */
export async function enrichHypotheticalLineResult(analyzePosition: AnalyzePosition, result: unknown): Promise<unknown> {
  const parsed = HypotheticalLineResultSchema.safeParse(result);
  if (!parsed.success || parsed.data.moves.length === 0) return result;
  const line = parsed.data;
  const facts = lineFacts(line);
  const endFen = line.resultFen ?? facts.endFen;
  if (!line.ok || !endFen) return { ...line, lineFacts: facts.notes };
  return {
    ...line,
    lineFacts: facts.notes,
    endPosition: renderPositionFacts(inspectMoves(endFen, [])),
    engine: await engineVerdict(analyzePosition, endFen)
  };
}

function lineFacts(line: HypotheticalLineResult): { notes: string[]; endFen: string | null } {
  const notes: string[] = [];
  let fen = line.startFen;
  for (const { san } of line.moves) {
    const move = inspectMoves(fen, [san]).moves[0];
    if (!move?.legal) return { notes, endFen: null };
    notes.push(renderMoveNote(move));
    fen = move.resultFen;
  }
  return { notes, endFen: fen };
}

/** The engine can be slow or down; a missing verdict must not cost the coach
 * the line it already has, so it says so and the coach can ask for it. */
async function engineVerdict(analyzePosition: AnalyzePosition, fen: string): Promise<string> {
  try {
    return renderEngineAnalysisSummary(await analyzePosition(fen), { compact: true });
  } catch {
    return 'unavailable — call get_engine_analysis with resultFen if you need it';
  }
}
