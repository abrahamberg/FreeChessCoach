import { episodeDetailSystemPrompt, EPISODE_FOLD_SYSTEM_PROMPT } from '@freechesscoach/prompts';
import { moveRefToPly } from '@freechesscoach/chess-analysis';
import type { SessionMessageRow } from '../db/repositories/session-messages.js';
import * as sessionMoveNotesRepo from '../db/repositories/session-move-notes.js';
import { compact, type StoredMessage } from './session-context.js';
import { type CoachContextDependencies, toStoredMessages } from './coach-context-replay.js';
import { isToolCallPart, isToolResultPart, toolCallId, toolCallInput, toolResultValue } from '../lib/tool-parts.js';

/** The sweet spot between keeping a conversation as-is and summarizing it: an
 * episode whose spoken text fits under this many characters (~600 tokens) is
 * handed to the next episode verbatim as a text transcript — a summary of
 * something that short would only lose information (and cost a model call).
 * Longer ones are summarized, to a length that grows with the transcript
 * (1 word per DETAIL_CHARS_PER_WORD chars) within [MIN, MAX] words. */
const DETAIL_VERBATIM_MAX_CHARS = 2400;
const DETAIL_CHARS_PER_WORD = 16;
const DETAIL_MIN_WORDS = 120;
const DETAIL_MAX_WORDS = 300;
const DETAIL_MAX_CHARS = 2500;

/**
 * Design doc §3: when an episode closes (the coach or the student moves on
 * from `closedPly`) without a coach-authored record_move_note for that ply,
 * fold its raw messages into one automatically so the next turn's
 * other-moves-summary still has something to say about it.
 *
 * Best-effort (final review #3): this runs in the critical path of both its
 * callers (coach-agent.ts's show_position jump-handling and
 * applyClientToolResult), inside the session lock, BEFORE the ply advances
 * and the tool-result is persisted. A transient light-model failure here
 * must never abort the turn — losing one auto-note doesn't corrupt
 * anything, it just leaves that episode's note missing until a later close
 * or an explicit recall_move.
 */
export async function closeEpisodeIfNeeded(
  deps: CoachContextDependencies,
  sessionId: string,
  closedEpisodeMessages: SessionMessageRow[],
  closedPly: number
): Promise<void> {
  if (closedEpisodeMessages.length === 0) return;

  const stored = toStoredMessages(closedEpisodeMessages);
  // final review #6: seed from this ply's own earlier closing note (e.g. a
  // previous visit's fold), never a hardcoded null — otherwise a revisit's
  // close would silently discard what the first visit already established.
  const existingNote = (await sessionMoveNotesRepo.findByPly(deps.db, sessionId, closedPly))?.note ?? null;
  const needsShortNote = !hasSuccessfulRecordMoveNoteCall(closedEpisodeMessages, closedPly);
  const fold = { appendOpenThreads: false } as const;

  // Two independent light-model calls, run together so the close (which sits
  // in the turn's critical path) costs one call's latency, not two.
  await Promise.all([
    needsShortNote ? foldShortNote() : Promise.resolve(),
    foldDetail()
  ]);

  async function foldShortNote(): Promise<void> {
    try {
      const note = await compact(stored, existingNote, deps.callLightModel, EPISODE_FOLD_SYSTEM_PROMPT, fold);
      await sessionMoveNotesRepo.upsert(deps.db, sessionId, closedPly, note);
    } catch (error) {
      console.error(`closeEpisodeIfNeeded: failed to auto-fold episode (session ${sessionId}, ply ${closedPly}):`, error);
    }
  }

  // The long-form summary of the episode that just ended: replaces whatever
  // the previous episode's was, so the coach always has the last conversation
  // in detail (hypothetical lines and all) without replaying it raw.
  async function foldDetail(): Promise<void> {
    try {
      const transcript = renderSpokenTranscript(stored);
      if (transcript === '') return;
      const earlier = existingNote ? `Earlier note on this same move (from a previous visit): ${existingNote}\n\n` : '';
      const detail =
        transcript.length <= DETAIL_VERBATIM_MAX_CHARS
          ? `${earlier}${transcript}`
          : await deps.callLightModel({
              system: episodeDetailSystemPrompt(detailWordBudget(transcript.length)),
              user: `${earlier}CONVERSATION TO SUMMARIZE\n${transcript}`
            });
      await sessionMoveNotesRepo.setLatestDetail(deps.db, sessionId, closedPly, detail.trim().slice(0, DETAIL_MAX_CHARS));
    } catch (error) {
      console.error(`closeEpisodeIfNeeded: failed to record episode detail (session ${sessionId}, ply ${closedPly}):`, error);
    }
  }
}

export function detailWordBudget(transcriptChars: number): number {
  return Math.min(DETAIL_MAX_WORDS, Math.max(DETAIL_MIN_WORDS, Math.round(transcriptChars / DETAIL_CHARS_PER_WORD)));
}

/** What was actually said, as "Student:"/"Coach:" lines — tool calls and
 * their (often large) JSON results are left out, they aren't conversation. */
export function renderSpokenTranscript(messages: StoredMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === 'tool') continue;
    const text = spokenText(message.content).trim();
    if (text) lines.push(`${message.role === 'user' ? 'Student' : 'Coach'}: ${text}`);
  }
  return lines.join('\n');
}

function spokenText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text' ? String((part as { text?: unknown }).text ?? '') : ''))
    .join('');
}

/**
 * final review #7: trusts the tool-CALL and its RESULT, not just the call —
 * if record_move_note returned `{ error: ... }` (e.g. an address that
 * doesn't resolve to a real move in this game), the auto-fallback must
 * still run, or the episode ends up with no note at all. Correlates a
 * record_move_note tool-call for this ply with its tool-result via
 * toolCallId, the same way includeOrphanedToolCall/
 * extendPastOrphanedToolResult correlate a call with its result.
 */
function hasSuccessfulRecordMoveNoteCall(messages: SessionMessageRow[], ply: number): boolean {
  const callIds = collectRecordMoveNoteCallIds(messages, ply);
  if (callIds.size === 0) return false;
  return messages.some((message) => hasSuccessfulToolResult(message, callIds));
}

function collectRecordMoveNoteCallIds(messages: SessionMessageRow[], ply: number): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const callId = recordMoveNoteCallIdForPly(part, ply);
      if (callId) ids.add(callId);
    }
  }
  return ids;
}

function recordMoveNoteCallIdForPly(part: unknown, ply: number): string | null {
  if (!isToolCallPart(part, 'record_move_note')) return null;
  const input = toolCallInput(part) as { moveNumber?: unknown; color?: unknown } | undefined;
  if (typeof input?.moveNumber !== 'number') return null;
  const color = (input.color === 'white' || input.color === 'black' ? input.color : null) as 'white' | 'black' | null;
  if (moveRefToPly(input.moveNumber, color) !== ply) return null;
  return toolCallId(part);
}

function hasSuccessfulToolResult(message: SessionMessageRow, callIds: Set<string>): boolean {
  if (message.role !== 'tool' || !Array.isArray(message.content)) return false;
  return message.content.some((part) => isSuccessfulRecordMoveNoteResult(part, callIds));
}

function isSuccessfulRecordMoveNoteResult(part: unknown, callIds: Set<string>): boolean {
  if (!isToolResultPart(part)) return false;
  const id = toolCallId(part);
  if (id === null || !callIds.has(id)) return false;
  const result = toolResultValue(part) as { recorded?: unknown } | undefined;
  return result?.recorded === true;
}
