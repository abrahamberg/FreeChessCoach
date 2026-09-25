import {
  decodeAnnotationNote,
  decodePositionContext,
  decodePositionDivider
} from '../features/chat/positionDivider.js';
import { decodeDivergedLine, decodeDivergedLineStart } from '../features/chat/divergedLine.js';
import { BOARD_MOVE_PATTERN, PLAYER_MOVE_PATTERN } from '../features/chat/sentinels.js';
import type { CoachMessage } from '../hooks/useCoachChat.js';
import { translateChessNotationForSpeech } from './sanToSpokenText.js';
import { completedSentences } from './streamingSentences.js';

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

/** Coach text spoken aloud shouldn't contain literal markup or chess
 * notation — an arrow token reads naturally as "e2 to e4", bold asterisks
 * just unwrap, and SAN move mentions ("Qh5+", "24. a4", "26...c6") get
 * translated to natural English (sanToSpokenText.ts) so they're
 * intelligible read aloud instead of spelled out letter by letter. Applied
 * once here, ahead of either TTS backend — model-independent, since neither
 * OpenAI nor the browser's Kokoro backend needs its own notation-reading
 * logic. */
function toSpokenText(text: string): string {
  return translateChessNotationForSpeech(
    text.replace(ARROW_TOKEN_PATTERN, (_match, from, to) => `${from} to ${to}`).replace(BOLD_PATTERN, '$1')
  );
}

/** The text Kokoro should read for a given message, or null if it's not
 * speakable prose — a user turn, blank, or one of MessageList's sentinel
 * shapes (MoveCard, PositionDivider, AnnotationNote, PositionContextMessage,
 * DivergedLineStart, DivergedLineMessage all render structured UI, not a
 * prose bubble). */
export function getSpeakableText(message: CoachMessage): string | null {
  if (!isSpeakableProse(message)) return null;
  return toSpokenText(message.text);
}

/** The spoken form of each sentence of a coach message that may still be
 * streaming in: only the sentences already complete (streamingSentences.ts),
 * plus the trailing one once `isFinal`. Split on the raw text first and
 * translated per sentence, so a sentence's spoken form never changes as
 * later text arrives. Empty for anything getSpeakableText wouldn't read. */
export function getSpeakableSentences(message: CoachMessage, isFinal: boolean): string[] {
  if (!isSpeakableProse(message)) return [];
  return completedSentences(message.text, isFinal).map(toSpokenText);
}

/** Whether a message is coach prose that would be read aloud (not a user
 * turn, not blank, not one of the structured sentinel shapes). */
export function isSpeakableProse(message: CoachMessage): boolean {
  return message.role === 'assistant' && message.text.trim() !== '' && !isSentinel(message.text);
}
