import { moveRefToPly } from '@freechesscoach/chess-analysis';
import { extractText, SESSION_START_MARKER } from '../features/session/sessionMessages.js';

/** The demo coach conversation is not written twice: it is the recorded session
 * (`GET /api/sessions/:id` of the sample player), cut at the first thing the
 * student typed. Everything before is shown as already-happened history; every
 * student message after it becomes a line the visitor sends themselves. */

export interface RecordedMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content?: unknown;
}

export interface ShowPosition {
  moveNumber: number;
  color: 'white' | 'black';
}

export interface ScriptedReply {
  text: string;
  showPosition?: ShowPosition;
}

export interface ScriptedTurn {
  userText: string;
  replies: ScriptedReply[];
}

/** One step of a streamed reply: text, or the coach moving the board. */
export type StreamStep = { kind: 'text'; text: string } | ({ kind: 'show_position' } & ShowPosition);

export function splitConversation(messages: RecordedMessage[]): { history: RecordedMessage[]; turns: ScriptedTurn[] } {
  const firstStudentIndex = messages.findIndex(isStudentMessage);
  if (firstStudentIndex === -1) return { history: messages, turns: [] };
  return { history: messages.slice(0, firstStudentIndex), turns: groupTurns(messages.slice(firstStudentIndex)) };
}

function isStudentMessage(message: RecordedMessage): boolean {
  return message.role === 'user' && extractText(message.content) !== SESSION_START_MARKER;
}

function groupTurns(messages: RecordedMessage[]): ScriptedTurn[] {
  const turns: ScriptedTurn[] = [];
  for (const message of messages) {
    if (message.role === 'tool') continue;
    if (message.role === 'user') turns.push({ userText: extractText(message.content), replies: [] });
    else turns.at(-1)?.replies.push(replyFrom(message));
  }
  return turns;
}

function replyFrom(message: RecordedMessage): ScriptedReply {
  const showPosition = showPositionFrom(message.content);
  const text = extractText(message.content);
  return showPosition ? { text, showPosition } : { text };
}

function showPositionFrom(content: unknown): ShowPosition | undefined {
  if (!Array.isArray(content)) return undefined;
  const call = content.find(
    (part): part is { toolName: string; input: ShowPosition } =>
      typeof part === 'object' && part !== null && (part as { toolName?: unknown }).toolName === 'show_position'
  );
  return call?.input;
}

/** How a turn reaches the browser, mirroring the real server: a client tool call
 * (show_position) ends the HTTP stream, the browser answers it with a new POST,
 * and the coach's words about the new position arrive in that next stream. */
export function streamsForTurn(turn: ScriptedTurn): StreamStep[][] {
  const streams: StreamStep[][] = [];
  let current: StreamStep[] = [];
  for (const reply of turn.replies) {
    if (reply.showPosition) {
      current.push({ kind: 'show_position', ...reply.showPosition });
      streams.push(current);
      current = [];
    }
    current = appendText(current, reply.text);
  }
  streams.push(current);
  return streams;
}

/** Consecutive replies with no board move between them read as one message. */
function appendText(steps: StreamStep[], text: string): StreamStep[] {
  const last = steps.at(-1);
  if (last?.kind === 'text') return [...steps.slice(0, -1), { kind: 'text', text: `${last.text}\n\n${text}` }];
  return [...steps, { kind: 'text', text }];
}

/** The ply of the last position the coach put on the board, or null if it has not yet.
 * A reopened session starts the board there. */
export function lastShownPly(messages: RecordedMessage[]): number | null {
  const shown = messages.map((message) => showPositionFrom(message.content)).filter((position) => position !== undefined);
  const last = shown.at(-1);
  return last ? moveRefToPly(last.moveNumber, last.color) : null;
}
