import { annotateCandidateMoves, applySanSequence } from '@chess-coach/chess-analysis';
import { renderEngineAnalysisSummary } from '@chess-coach/prompts';
import type { PositionAnalysis } from '@chess-coach/shared';
import { z } from 'zod';
import { tool, type ToolSet } from '../llm/tools.js';
import { createTurnGuardState, withTurnGuards, type TurnGuardState } from './coach-tool-guards.js';

/** The investigation sub-agent's own budget — separate from, and never
 * shared with, the outer coach turn's TOOL_BUDGETS (a fresh TurnGuardState
 * per investigation call). analyze_fen is capped tighter than the outer
 * step cap (position-investigator.ts's MAX_INVESTIGATOR_STEPS) since a
 * single step can contain multiple parallel tool calls — the per-tool
 * budget, not the step count, is the real backstop against an engine-call
 * fan-out. */
export const INVESTIGATOR_TOOL_BUDGETS: Partial<Record<string, number>> = {
  analyze_fen: 3,
  apply_moves: 4,
  list_candidate_moves: 4
};

export interface InvestigatorToolsDependencies {
  analyzePosition: (fen: string) => Promise<PositionAnalysis>;
}

/** Fresh guard state per call — buildInvestigatorTools is expected to be
 * called once per investigation (position-investigator.ts's
 * investigatePosition), mirroring buildCoachTools' one-state-per-turn
 * convention. */
export function buildInvestigatorTools(deps: InvestigatorToolsDependencies, state: TurnGuardState = createTurnGuardState()): ToolSet {
  return {
    apply_moves: tool({
      description:
        'Apply a sequence of SAN moves to a FEN and get back every intermediate position, including ones that never happened in the real game. Use this to walk into a candidate line or a hypothetical variation before checking it with analyze_fen.',
      inputSchema: z.object({ fen: z.string(), moves: z.array(z.string().min(1)).min(1).max(12) }),
      execute: withTurnGuards(state, 'apply_moves', applyMoves, INVESTIGATOR_TOOL_BUDGETS)
    }),
    list_candidate_moves: tool({
      description:
        'Cheaply triage a list of candidate SAN moves from a FEN — for each one, whether it creates a fork, hangs a piece, under-defends a piece, or changes mobility. No engine call — use this first to narrow down which candidates are worth spending an analyze_fen call on.',
      inputSchema: z.object({ fen: z.string(), moves: z.array(z.string().min(1)).min(1).max(12) }),
      execute: withTurnGuards(state, 'list_candidate_moves', (args: { fen: string; moves: string[] }) =>
        Promise.resolve(annotateCandidateMoves(args.fen, args.moves)), INVESTIGATOR_TOOL_BUDGETS)
    }),
    analyze_fen: tool({
      description:
        'Run the engine on a FEN and get back a curated summary: the best move with eval and line, other options, and any hanging pieces, forks, or favorable captures. This is your only source of ground-truth engine numbers — never guess an eval or a line.',
      inputSchema: z.object({ fen: z.string() }),
      execute: withTurnGuards(state, 'analyze_fen', (args: { fen: string }) => analyzeFen(deps, args), INVESTIGATOR_TOOL_BUDGETS)
    })
  };
}

async function applyMoves(args: { fen: string; moves: string[] }): Promise<{ fen: string; moveSan: string }[] | { error: string }> {
  const result = applySanSequence(args.fen, args.moves);
  if (result.error) return { error: result.error };
  return result.moves.map((move) => ({ fen: move.fen, moveSan: move.san }));
}

async function analyzeFen(deps: InvestigatorToolsDependencies, args: { fen: string }): Promise<string> {
  const analysis = await deps.analyzePosition(args.fen);
  return renderEngineAnalysisSummary(analysis);
}
