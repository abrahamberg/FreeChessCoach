import type { SessionRow } from '../db/repositories/sessions.js';
import { investigatePosition } from './position-investigator.js';
import type { CoachToolsDependencies } from './coach-tools.js';
import type { CoachAgentDependencies, ModelResolver } from './coach-agent-types.js';

/** Assembles buildCoachTools' dependency object for one turn — split out of
 * startTurn (AGENTS.md rule 2: ~250-line file guideline) once
 * investigate_position's own closure needed to be wired in here alongside
 * the rest. `resolveModel` is the SAME resolver startTurn already resolved
 * for its own standard-tier call above — investigatePosition calls it again
 * itself, with 'light', so a test that injects a mock resolveModel controls
 * both tiers by branching on the tier argument. */
export function buildTurnToolsDependencies(
  deps: CoachAgentDependencies,
  session: SessionRow,
  callLightModel: (messages: { system: string; user: string }) => Promise<string>,
  resolveModel: ModelResolver
): CoachToolsDependencies {
  return {
    db: deps.db,
    jobQueue: deps.jobQueue,
    analyzePosition: deps.analyzePosition,
    callLightModel,
    investigatePosition: (args) =>
      investigatePosition(
        { db: deps.db, gatewayConfig: deps.gatewayConfig, resolveModel, analyzePosition: deps.analyzePosition },
        { userId: session.userId, sessionId: session.id },
        args
      ),
    puzzlePool: deps.puzzlePool
  };
}
