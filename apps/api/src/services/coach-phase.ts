import type { CoachPhase } from '@freechesscoach/shared';
import * as sessionMessagesRepo from '../db/repositories/session-messages.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import type { SessionRow } from '../db/repositories/sessions.js';
import { currentEpisode } from '../lib/episodes.js';
import { NotFoundError } from '../lib/errors.js';
import * as coachContext from './coach-context.js';
import type { CoachAgentDependencies, StartTurnInput } from './coach-agent-types.js';

/** What the coach reads first in the round it has just entered. */
export const REVIEW_START_MARKER = '[review_start]';
export const WRAP_UP_START_MARKER = '[wrap_up_start]';

/** The two client tools that move a coaching session between its rounds. The
 * browser acknowledges them like any client tool; the server turns the
 * acknowledgement into a phase change. */
const PHASE_CHANGES: Record<string, { from: CoachPhase; to: CoachPhase; marker: string }> = {
  begin_review: { from: 'progress_open', to: 'review', marker: REVIEW_START_MARKER },
  begin_wrap_up: { from: 'review', to: 'progress_close', marker: WRAP_UP_START_MARKER }
};

export function isPhaseToolName(toolName: string): boolean {
  return toolName in PHASE_CHANGES;
}

type ClientToolResult = NonNullable<StartTurnInput['clientToolResult']>;

/**
 * Moves the session into its next round. The tool's result is stored with the
 * round that called it (so the call and its result stay adjacent in that
 * round's own history), then a marker opens the next round's history. Leaving
 * the review closes its last episode first, so the final moment reaches "##
 * Other moves discussed" before the closing round reads it. A result that does
 * not match the round the session is in (a stale or repeated one) changes
 * nothing.
 */
export async function applyPhaseToolResult(
  deps: CoachAgentDependencies,
  callLightModel: (messages: { system: string; user: string }) => Promise<string>,
  session: SessionRow,
  toolResult: ClientToolResult
): Promise<SessionRow> {
  const change = PHASE_CHANGES[toolResult.toolName];
  if (!change || session.phase !== change.from) return session;

  if (change.from === 'review') await closeReviewEpisode(deps, callLightModel, session);

  await sessionMessagesRepo.insert(
    deps.db,
    session.id,
    'tool',
    [{ type: 'tool-result', toolCallId: toolResult.toolCallId, toolName: toolResult.toolName, output: { type: 'json', value: { phase: change.to } } }],
    change.from === 'review' ? session.subjectPly : null,
    change.from
  );
  await sessionsRepo.setPhase(deps.db, session.id, change.to);
  await sessionMessagesRepo.insert(deps.db, session.id, 'user', change.marker, change.to === 'review' ? session.subjectPly : null, change.to);

  const updated = await sessionsRepo.findById(deps.db, session.id);
  if (!updated) throw new NotFoundError('Session not found');
  return updated;
}

async function closeReviewEpisode(
  deps: CoachAgentDependencies,
  callLightModel: (messages: { system: string; user: string }) => Promise<string>,
  session: SessionRow
): Promise<void> {
  const history = await sessionMessagesRepo.listForPhase(deps.db, session.id, 'review');
  const episode = currentEpisode(history, session.subjectPly);
  await coachContext.closeEpisodeIfNeeded({ db: deps.db, callLightModel }, session.id, episode.messages, session.subjectPly);
}
