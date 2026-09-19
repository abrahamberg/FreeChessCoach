import { lastShownPly } from './conversationScript.js';
import type { DemoConversation, DemoTurnRequest } from './demoConversation.js';

export type DemoPersona = 'sixWeeks' | 'oneYear';

/** Recorded API responses of the sample player, keyed by path + query. Written
 * by scripts/record-demo-fixtures.mjs from the seeded demo users. */
export interface DemoFixtures {
  /** The coach session the visitor can play through. */
  sessionId: string;
  /** Sam six weeks in: every page. */
  base: Record<string, unknown>;
  /** Sam a year in: only the Stats responses, which replace the base ones. */
  oneYear: Record<string, unknown>;
}

export interface DemoFetchOptions {
  fixtures: DemoFixtures;
  conversation: DemoConversation;
  persona: () => DemoPersona;
  realFetch: typeof fetch;
  /** Called with the reason whenever a write is refused, so the page can say so. */
  onRefused?: (message: string) => void;
}

const READ_ONLY_MESSAGE = 'This is a read-only demo with sample data. Sign in to do this with your own games.';
const PLAY_MESSAGE = 'Sign in to play. Playing the bots and the coach needs a free account.';

/** Starting a game is the one write with its own wording: it is the button people press most. */
function refusalMessage(url: string): string {
  return /^\/api\/sessions\/play(-bot)?$/.test(url) ? PLAY_MESSAGE : READ_ONLY_MESSAGE;
}

/** A `fetch` that never reaches the network for `/api`: reads come from the
 * recorded fixtures, every write is refused, and the coach's reply is scripted.
 * Nothing in the demo can read or change a real account. */
export function createDemoFetch({ fixtures, conversation, persona, realFetch, onRefused }: DemoFetchOptions): typeof fetch {
  return (input, init) => {
    const url = urlOf(input);
    if (!url.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (isCoachMessage(url, method)) return Promise.resolve(conversation.reply(readTurnRequest(init)));
    if (method !== 'GET') {
      const message = refusalMessage(url);
      onRefused?.(message);
      return Promise.resolve(problem(403, message));
    }
    return Promise.resolve(read(url, fixtures, conversation, persona()));
  };
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return `${input.pathname}${input.search}`;
  return input.url.replace(/^https?:\/\/[^/]+/, '');
}

function isCoachMessage(url: string, method: string): boolean {
  return method === 'POST' && /^\/api\/sessions\/[^/?]+\/messages$/.test(url);
}

function readTurnRequest(init: RequestInit | undefined): DemoTurnRequest {
  try {
    return JSON.parse(String(init?.body ?? '{}')) as DemoTurnRequest;
  } catch {
    return {} as DemoTurnRequest;
  }
}

function read(url: string, fixtures: DemoFixtures, conversation: DemoConversation, persona: DemoPersona): Response {
  if (url === `/api/sessions/${fixtures.sessionId}`) return sessionResponse(fixtures, conversation);
  const table = persona === 'oneYear' && url in fixtures.oneYear ? fixtures.oneYear : fixtures.base;
  if (!(url in table)) return problem(404, 'This part of the app is not included in the demo.');
  return json(table[url]);
}

/** The recorded session is a finished lesson. While the visitor is still playing
 * it through it must look like a live one: no summary or homework (they give the
 * ending away), and the board on the position the coach last showed. */
function sessionResponse(fixtures: DemoFixtures, conversation: DemoConversation): Response {
  const detail = fixtures.base[`/api/sessions/${fixtures.sessionId}`] as Record<string, unknown>;
  const messages = conversation.visibleMessages();
  const { nextLine, busy } = conversation.state();
  const inProgress = nextLine !== null || busy;
  const live = inProgress ? { status: 'active', summary: null, homework: null } : {};
  return json({ ...detail, ...live, subjectPly: lastShownPly(messages) ?? detail.subjectPly, messages });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function problem(status: number, title: string): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status }), {
    status,
    headers: { 'content-type': 'application/problem+json' }
  });
}
