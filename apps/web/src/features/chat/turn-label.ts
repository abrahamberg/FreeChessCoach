import type { DebugMessage, DebugTurnView } from './useTurnDebugSnapshot.js';

/** The picker's name for a turn: what the student said, else the time. */
export function turnLabel(turn: DebugTurnView): string {
  const time = turn.at ? new Date(turn.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'latest';
  const said = turn.snapshot ? lastUserText(turn.snapshot.request.messages as DebugMessage[]) : '';
  return said ? `${time} · ${said.length > 28 ? `${said.slice(0, 27)}…` : said}` : time;
}

function lastUserText(messages: DebugMessage[]): string {
  const user = [...messages].reverse().find((message) => message.role === 'user');
  if (!user) return '';
  if (typeof user.content === 'string') return user.content.trim();
  if (!Array.isArray(user.content)) return '';
  const part = (user.content as unknown[]).find((each): each is { type: 'text'; text: string } => {
    const candidate = each as { type?: unknown; text?: unknown };
    return candidate.type === 'text' && typeof candidate.text === 'string';
  });
  return part?.text.trim() ?? '';
}
