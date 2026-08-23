import { decodeAnnotationNote, decodePositionContext, decodePositionDivider } from '../features/chat/positionDivider.js';
import { decodeDivergedLine, decodeDivergedLineStart } from '../features/chat/divergedLine.js';
import { BOARD_MOVE_PATTERN, PLAYER_MOVE_PATTERN } from '../features/chat/sentinels.js';
import type { CoachMessage } from '../hooks/useCoachChat.js';

const ARROW_TOKEN_PATTERN = /\[([a-h][1-8])-([a-h][1-8])\]/g;
const BOLD_PATTERN = /\*\*(.+?)\*\*/g;

/** Any of the encoded, non-prose message shapes MessageList.tsx renders as
 * structured UI instead of a text bubble — none of these are meant to be
 * read aloud. */
function isSentinel(text: string): boolean {
  return (
    BOARD_MOVE_PATTERN.test(text) ||
    PLAYER_MOVE_PATTERN.test(text) ||
    decodePositionDivider(text) !== null ||
    decodeAnnotationNote(text) !== null ||
    decodePositionContext(text) !== null ||
    decodeDivergedLineStart(text) !== null ||
    decodeDivergedLine(text) !== null
  );
}

/** Coach text spoken aloud shouldn't contain literal markup — an arrow token
 * reads naturally as "e2 to e4", and bold asterisks just unwrap. */
function toSpokenText(text: string): string {
  return text.replace(ARROW_TOKEN_PATTERN, (_match, from, to) => `${from} to ${to}`).replace(BOLD_PATTERN, '$1');
}

/** The text Kokoro should read for a given message, or null if it's not
 * speakable prose — a user turn, blank, or one of MessageList's sentinel
 * shapes (MoveCard, PositionDivider, AnnotationNote, PositionContextMessage,
 * DivergedLineStart, DivergedLineMessage all render structured UI, not a
 * prose bubble). */
export function getSpeakableText(message: CoachMessage): string | null {
  if (message.role !== 'assistant') return null;
  if (message.text.trim() === '') return null;
  if (isSentinel(message.text)) return null;
  return toSpokenText(message.text);
}
