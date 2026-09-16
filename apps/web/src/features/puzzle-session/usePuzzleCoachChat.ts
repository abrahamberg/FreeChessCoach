import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachMessage, CoachToolCall } from '../../hooks/useCoachChat.js';
import { readCoachStream } from '../../hooks/coachStream.js';
import { encodeAnnotationNote, type AnnotationNoteState } from '../chat/positionDivider.js';
import { encodeDivergedLineStart } from '../chat/divergedLine.js';

export interface UsePuzzleCoachChatOptions {
  /** Client tools (annotate_board, hypothetical_line, expect_move): return
   * the tool result to round-trip it back to the coach. Return undefined for
   * advance_puzzle (a server tool — its result already arrived in this same
   * stream, see onServerToolResult). */
  onToolCall?: (toolCall: CoachToolCall) => unknown;
  initialMessages?: CoachMessage[];
  /** advance_puzzle is the only server-executed tool in this session kind —
   * fired once its result streams in, so the page can advance the board to
   * the next item (or notice the session just completed). */
  onServerToolResult?: (toolName: string, output: unknown) => void;
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

const SERVER_TOOL_RESULT_NAMES = new Set(['advance_puzzle']);

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

  const postTurn = useCallback(
    async (body: { content?: string } | { clientToolResult: { toolCallId: string; toolName: string; result: unknown } }) => {
      const response = await fetch(`/api/puzzle-sessions/${sessionId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.body) return;

      const assistantId = crypto.randomUUID();
      let assistantText = '';
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

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
