import type { ChatMessage } from './messages.js';

/** What the model is told when a stored tool call never got its result. */
export const UNANSWERED_TOOL_RESULT = 'No result came back for this call — assume it did nothing and carry on.';

interface ToolCallRef {
  toolCallId: string;
  toolName: string;
}

function toolCallsOf(message: ChatMessage): ToolCallRef[] {
  if (message.role !== 'assistant' || typeof message.content === 'string') return [];
  return message.content.flatMap((part) =>
    part.type === 'tool-call' ? [{ toolCallId: part.toolCallId, toolName: part.toolName }] : []
  );
}

function answeredIds(messages: ChatMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    for (const part of message.content) {
      if (part.type === 'tool-result') ids.add(part.toolCallId);
    }
  }
  return ids;
}

function syntheticResults(calls: ToolCallRef[]): ChatMessage {
  return {
    role: 'tool',
    content: calls.map((call) => ({
      type: 'tool-result',
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: { type: 'text', value: UNANSWERED_TOOL_RESULT }
    }))
  };
}

/**
 * A client tool whose result never came back (the tab closed, the client had
 * no handler for it) leaves a stored tool call with no tool result. The AI SDK
 * rejects any history shaped like that (MissingToolResultsError), so every
 * later turn of the session fails. Replaying the history with a stand-in
 * result right after each unanswered call keeps the session usable; the
 * append-only transcript itself is left untouched.
 */
export function answerUnansweredToolCalls(messages: ChatMessage[]): ChatMessage[] {
  const answered = answeredIds(messages);
  return messages.flatMap((message) => {
    const unanswered = toolCallsOf(message).filter((call) => !answered.has(call.toolCallId));
    return unanswered.length === 0 ? [message] : [message, syntheticResults(unanswered)];
  });
}
