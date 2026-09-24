import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachMessage, CoachToolCall } from '../../hooks/useCoachChat.js';
import { readCoachStream, readProblemDetailTitle } from '../../hooks/coachStream.js';
import { encodeAnnotationNote, type AnnotationNoteState } from '../chat/positionDivider.js';
import { encodeDivergedLineStart } from '../chat/divergedLine.js';

export interface UsePuzzleCoachChatOptions {
  /** Client tools (annotate_board, hypothetical_line): return
   * the tool result to round-trip it back to the coach. Return undefined for
   * advance_puzzle (a server tool — its result already arrived in this same
   * stream, see onServerToolResult). */
  onToolCall?: (toolCall: CoachToolCall) => unknown;
  initialMessages?: CoachMessage[];
  /** advance_puzzle and play_next_move are the server-executed tools in this
   * session kind — fired once the result streams in, so the page can pick up
   * the board's new position (or the next item / a completed session). */
  onServerToolResult?: (toolName: string, output: unknown) => void;
  /** Same contract as useCoachChat's own onUnlockRequired/onSetupRequired —
   * fires when a turn fails because the AI is locked, or was never set up at
   * all. Previously this hook had neither check at all: a non-ok response
   * (a plain problem+json body, not an SSE stream) was piped straight into
   * readCoachStream, which silently failed and left the coach's bubble
   * permanently blank with no explanation to the student. */
  onUnlockRequired?: (retry: () => Promise<void>) => void;
  onSetupRequired?: () => void;
}

export interface UsePuzzleCoachChatResult {
  messages: CoachMessage[];
  isStreaming: boolean;
  activeToolName: string | null;
  isThinking: boolean;
  sendMessage: (content: string) => Promise<void>;
  /** Resumes the turn on an empty body — how the coach opens a fresh puzzle
   * session (or the next puzzle) on its own, with no new user-role message. */
  kickoff: () => Promise<void>;
}

const SERVER_TOOL_RESULT_NAMES = new Set(['advance_puzzle', 'play_next_move']);

/**
 * docs/plan.md Phase 59, Task 59.6 — puzzle-session sibling of
 * hooks/useCoachChat.ts: drives POST /api/puzzle-sessions/:id/messages
 * instead of /api/sessions/:id/messages, and this session kind's smaller
 * tool set (no show_position — see puzzle-session-tools.ts on the API side
 * for why). Kept as its own hook rather than parameterizing useCoachChat:
 * the two request contracts and tool sets have diverged enough (no
 * show_position handling, no sanMoves, a different server-tool name) that
 * branching inside one hook would be harder to follow than two small ones.
 */
export function usePuzzleCoachChat(sessionId: string, options: UsePuzzleCoachChatOptions = {}): UsePuzzleCoachChatResult {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);

  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && options.initialMessages && options.initialMessages.length > 0) {
      seededRef.current = true;
      setMessages(options.initialMessages);
    }
  }, [options.initialMessages]);

  /** A turn this hook abandons mid-stream (StrictMode's dev-only double
   * mount/unmount firing kickoff() twice, or a real unmount while the coach
   * is still composing) must not leave its fetch running unseen: the server
   * holds a per-session lock for the whole turn (puzzle-session-turn.ts) and
   * only releases it when the connection closes. An un-aborted fetch whose
   * reader nobody drains any further doesn't reliably signal that close, so
   * every later turn on this session — this kickoff's own retry included —
   * queues behind the abandoned one forever. */
  const inFlightRef = useRef<Set<AbortController>>(new Set());
  useEffect(
    () => () => {
      for (const controller of inFlightRef.current) controller.abort();
      inFlightRef.current.clear();
    },
    []
  );

  const postTurn = useCallback(
    async (body: { content?: string } | { clientToolResult: { toolCallId: string; toolName: string; result: unknown } }) => {
      const controller = new AbortController();
      inFlightRef.current.add(controller);
      let response: Response;
      try {
        response = await fetch(`/api/puzzle-sessions/${sessionId}/messages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } catch (error) {
        inFlightRef.current.delete(controller);
        if (controller.signal.aborted) return;
        throw error;
      }

      const assistantId = crypto.randomUUID();
      let assistantText = '';
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      // Same "must check response.ok before treating the body as an SSE
      // stream" contract as useCoachChat's own postTurn — a thrown error
      // (no AI set up, or a locked setup) never reaches the stream at all.
      if (!response.ok) {
        inFlightRef.current.delete(controller);
        const reason = await readProblemDetailTitle(response);
        setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, text: reason } : message)));
        if (response.status === 400 && /set up your ai/i.test(reason)) {
          options.onSetupRequired?.();
        } else if (response.status === 400 && /unlock your ai setup/i.test(reason)) {
          options.onUnlockRequired?.(async () => {
            setMessages((prev) => prev.filter((message) => message.id !== assistantId));
            await postTurn(body);
          });
        }
        return;
      }
      if (!response.body) {
        inFlightRef.current.delete(controller);
        return;
      }

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
            console.error('puzzle coach stream error:', message);
          },
          onToolOutput: (toolOutput) => {
            if (SERVER_TOOL_RESULT_NAMES.has(toolOutput.toolName)) {
              options.onServerToolResult?.(toolOutput.toolName, toolOutput.output);
            }
          },
          onToolCall: async (toolCall) => {
            setActiveToolName(toolCall.toolName);
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
        inFlightRef.current.delete(controller);
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
    try {
      await postTurn({});
    } finally {
      setIsStreaming(false);
    }
  }, [postTurn]);

  const isThinking = isStreaming && messages.at(-1)?.text === '';

  return { messages, isStreaming, activeToolName, isThinking, sendMessage, kickoff };
}
