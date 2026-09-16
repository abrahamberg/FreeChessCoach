import type { PuzzleSessionDetail } from '@freechesscoach/shared';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { extractText } from '../session/sessionMessages.js';

/** Puzzle-session sibling of session/sessionMessages.ts's toCoachMessages —
 * much simpler, since there's no show_position tool to turn into a position
 * divider on reload (see puzzle-session-tools.ts on the API side). Reuses
 * extractText as-is: a stored message's content shape (AI SDK parts array,
 * or a bare string) is identical across both session kinds. */
export function toPuzzleCoachMessages(messages: PuzzleSessionDetail['messages']): CoachMessage[] {
  return messages
    .filter((message) => message.role !== 'tool')
    .map((message): CoachMessage => ({ id: message.id, role: message.role as 'user' | 'assistant', text: extractText(message.content) }))
    .filter((message) => message.text.trim() !== '');
}
