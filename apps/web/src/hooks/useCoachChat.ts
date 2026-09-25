import { moveRefToPly } from '@freechesscoach/chess-analysis';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readCoachStream, readProblemDetailTitle } from './coachStream.js';
import { encodeDivergedLineStart } from '../features/chat/divergedLine.js';
import { encodeAnnotationNote, encodePositionDivider, sanForPly, type AnnotationNoteState } from '../features/chat/positionDivider.js';
import { noteRateLimit } from '../api/rate-limit-notice.js';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface CoachToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface UseCoachChatOptions {
  /** Client tools (show_position, annotate_board): return the tool result to
   * round-trip it back to the coach. Return undefined for server-executed
   * tools — their result already arrived in the same stream. */
  onToolCall?: (toolCall: CoachToolCall) => unknown;
  /** Prior turns from GET /api/sessions/:id, so reopening an in-progress
   * session shows its transcript instead of starting blank. */
  initialMessages?: CoachMessage[];
  /** design.md §5.3: SAN of every played move, used to label a show_position
   * jump as "— move N, after <SAN> —" in the transcript. */
  sanMoves?: string[];
  /** architecture §14: play mode's server-executed tools (play_coach_move,
   * undo_last_move) resolve mid-stream with no client round-trip — this is
   * how the caller hears the result to update the board/positions. Other
   * tool names (get_candidate_moves, record_finding, ...) are silent and
   * never reach this callback. */
  onServerToolResult?: (toolName: string, output: unknown) => void;
  /** Fires every time a turn fails specifically because the AI needs to be
   * unlocked (never for any other failure) — the caller should prompt for
   * the unlock phrase (e.g. open UnlockPhraseModal). Call the given `retry`
   * once unlocking succeeds to resend the message that failed; it replaces
   * the error bubble with a fresh streamed reply instead of adding a
   * duplicate. Fires again on every subsequent failure, even if a previous
   * prompt was dismissed without unlocking. */
  onUnlockRequired?: (retry: () => Promise<void>) => void;
  /** Fires when a turn fails because the AI was never set up at all (no
   * passphrase to unlock — there's nothing saved yet). Distinct from
   * onUnlockRequired: this should send the student to Settings to create a
   * setup, not prompt them for a phrase they were never asked to choose. */
  onSetupRequired?: () => void;
}

type PostTurnBody = { content?: string } | { clientToolResult: { toolCallId: string; toolName: string; result: unknown } };

export interface UseCoachChatResult {
  messages: CoachMessage[];
  isStreaming: boolean;
  /** design.md §5.3: the tool currently in flight this turn, or null between
   * turns / once the coach's text resumes. ToolActivity decides which tool
   * names actually render something (most are backstage). */
  activeToolName: string | null;
  /** design.md §5.7: true while waiting for the coach's first token this
   * turn (the empty assistant placeholder hasn't received any text yet). */
  isThinking: boolean;
  /** Non-null while `isThinking` is true and this is the session's kickoff
   * turn — its first token can take much longer than an ordinary reply
   * (coaching-plan.ts's ensureCoachingPlan runs a whole extra LLM call
   * before the turn's own streaming even starts), so the UI shows this
   * instead of the generic thinking dots. Null for every other turn. */
  thinkingLabel: string | null;
  sendMessage: (content: string) => Promise<void>;
  /** Resumes a turn on whatever's already pending in history (the
   * [session_start] marker) without adding a new user-role message — how the
   * coach opens a fresh session on its own. */
  kickoff: () => Promise<void>;
}

const SERVER_TOOL_RESULT_NAMES = new Set(['play_coach_move', 'undo_last_move']);

/** get_candidate_moves resolves too (architecture §14) but is purely
 * informational — the coach uses it to decide, nothing to render. */
function isServerToolResultName(toolName: string): boolean {
  return SERVER_TOOL_RESULT_NAMES.has(toolName);
}

/** Drives POST /api/sessions/:id/messages (architecture §7.2). Reads the
 * stream directly (see ./coachStream.ts) rather than using `useChat`: this
 * project's request contract is {content} / {clientToolResult}, and a client
 * tool result is a fresh POST that resumes the same turn — neither of which
 * matches useChat's own message-array protocol. */
export function useCoachChat(sessionId: string, options: UseCoachChatOptions = {}): UseCoachChatResult {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [isKickoffTurn, setIsKickoffTurn] = useState(false);

  // The session/game fetch (SessionPage) resolves after this hook's first
  // render, so initialMessages arrives on a later render, not at mount —
  // seed once when it shows up rather than via useState's lazy initializer.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && options.initialMessages && options.initialMessages.length > 0) {
      seededRef.current = true;
      setMessages(options.initialMessages);
    }
  }, [options.initialMessages]);

  const postTurn = useCallback(
    async (body: PostTurnBody) => {
      // Pushed before the request goes out, not after it resolves: on a
      // fresh game's first turn, the server blocks on a coaching-plan LLM
      // call before it ever sends response headers (see coaching-plan.ts's
      // ensureCoachingPlan, called from startTurn before reply.hijack()), so
      // waiting for `fetch` to resolve here left the UI showing nothing at
      // all for however long that took — isThinking has nothing to key off
      // until this placeholder exists.
      const assistantId = crypto.randomUUID();
      let assistantText = '';
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });

      // A thrown error (e.g. "unlock your AI setup") never reaches the SSE
      // stream at all — it's a plain problem+json response instead (see
      // routes/sessions.ts: startTurn is awaited before reply.hijack()).
      // Without this, the assistant bubble above stays permanently blank —
      // readCoachStream would otherwise try to parse the error body as an
      // SSE frame and only console.error it.
      noteRateLimit(response);
      if (!response.ok) {
        const reason = await readProblemDetailTitle(response);
        setMessages((prev) =>
          prev.map((message) => (message.id === assistantId ? { ...message, text: reason } : message))
        );
        // getModelForUser's own ValidationError (llm/gateway.ts) — the same
        // message coaching-plan.ts's ensureCoachingPlan surfaces on a game's
        // first turn. Two distinct messages share the 400 status: a user who
        // never saved a setup gets sent to Settings, while one whose unlock
        // just expired gets the passphrase prompt — checked in that order
        // since "set up your ai" alone doesn't mention unlocking at all.
        if (response.status === 400 && /set up your ai/i.test(reason)) {
          options.onSetupRequired?.();
        } else if (response.status === 400 && /unlock your ai setup/i.test(reason)) {
          // Named recursive reference to `postTurn` itself: by the time
          // `retry` actually runs (after the user unlocks, an arbitrary
          // amount later), this useCallback's own binding is long since
          // assigned, so this is safe, not a use-before-init.
          options.onUnlockRequired?.(async () => {
            setMessages((prev) => prev.filter((message) => message.id !== assistantId));
            setIsStreaming(true);
            try {
              await postTurn(body);
            } finally {
              setIsStreaming(false);
            }
          });
        }
        return;
      }
      if (!response.body) return;

      try {
        await readCoachStream(response.body, {
          onTextDelta: (delta) => {
            setActiveToolName(null);
            assistantText += delta;
            setMessages((prev) =>
              prev.map((message) => (message.id === assistantId ? { ...message, text: assistantText } : message))
            );
          },
          onError: (message) => {
            console.error('coach stream error:', message);
            // A mid-stream provider error skips onFinish server-side (see
            // coach-agent-turn.ts's onError), so nothing gets persisted for
            // this turn — without this, the placeholder pushed above stays
            // permanently blank (assistantText never received a delta) and
            // the session looks dead with no visible sign anything failed.
            setMessages((prev) =>
              prev.map((current) =>
                current.id === assistantId && current.text === ''
                  ? { ...current, text: 'Something went wrong generating a reply. Try sending your message again.' }
                  : current
              )
            );
          },
          onToolOutput: (toolOutput) => {
            if (isServerToolResultName(toolOutput.toolName)) {
              options.onServerToolResult?.(toolOutput.toolName, toolOutput.output);
            }
          },
          onToolCall: async (toolCall) => {
            setActiveToolName(toolCall.toolName);
            if (toolCall.toolName === 'show_position') {
              const { moveNumber, color } = toolCall.input as { moveNumber: number; color: 'white' | 'black' | null };
              const ply = moveRefToPly(moveNumber, color);
              const san = sanForPly(options.sanMoves ?? [], ply);
              if (san) {
                setMessages((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), role: 'assistant', text: encodePositionDivider(ply, san) }
                ]);
              }
            }
            if (toolCall.toolName === 'annotate_board') {
              const annotation = toolCall.input as AnnotationNoteState;
              if (annotation.arrows.length > 0 || annotation.highlights.length > 0) {
                setMessages((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), role: 'assistant', text: encodeAnnotationNote(annotation) }
                ]);
              }
            }
            const result = options.onToolCall?.(toolCall);
            if (toolCall.toolName === 'hypothetical_line' && result !== undefined) {
              const hypothetical = result as { ok: boolean; basePly: number; moves: { san: string }[]; resultFen?: string };
              if (hypothetical.moves.length > 0) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    text: encodeDivergedLineStart({
                      basePly: hypothetical.basePly,
                      sanMoves: hypothetical.moves.map((move) => move.san),
                      resultFen: hypothetical.resultFen ?? ''
                    })
                  }
                ]);
              }
            }
            if (result !== undefined) {
              await postTurn({
                clientToolResult: { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, result }
              });
            }
          }
        });
      } finally {
        setActiveToolName(null);
      }
    },
    [sessionId, options]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: content }]);
      setIsStreaming(true);
      try {
        await postTurn({ content });
      } finally {
        setIsStreaming(false);
      }
    },
    [postTurn]
  );

  const kickoff = useCallback(async () => {
    setIsStreaming(true);
    setIsKickoffTurn(true);
    try {
      await postTurn({});
    } finally {
      setIsStreaming(false);
      setIsKickoffTurn(false);
    }
  }, [postTurn]);

  const isThinking = isStreaming && messages.at(-1)?.text === '';
  const thinkingLabel = isThinking && isKickoffTurn ? 'Studying your game…' : null;

  return { messages, isStreaming, activeToolName, isThinking, thinkingLabel, sendMessage, kickoff };
}
