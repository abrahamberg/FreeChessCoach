import { describe, expect, it, vi } from 'vitest';
import { DemoConversation } from './demoConversation.js';
import { createDemoFetch, type DemoFixtures } from './demoFetch.js';

const instant = { thinkingMs: 0, chunkMs: 0, sleep: () => Promise.resolve() };
const recorded = [
  { id: '1', role: 'assistant' as const, content: [{ type: 'text', text: 'Welcome.' }] },
  { id: '2', role: 'user' as const, content: [{ type: 'text', text: 'Hello' }] },
  { id: '3', role: 'assistant' as const, content: [{ type: 'text', text: 'Hi Sam.' }] }
];
const fixtures: DemoFixtures = {
  sessionId: 's1',
  base: {
    '/api/users/me': { displayName: 'Sam' },
    '/api/stats/rating?range=all': { games: 250 },
    '/api/sessions/s1': { id: 's1', status: 'active', messages: recorded }
  },
  oneYear: { '/api/stats/rating?range=all': { games: 3420 } }
};

function setup(persona: 'sixWeeks' | 'oneYear' = 'sixWeeks') {
  const realFetch = vi.fn(() => Promise.resolve(new Response('real')));
  const conversation = new DemoConversation(recorded, instant);
  const demoFetch = createDemoFetch({ fixtures, conversation, persona: () => persona, realFetch });
  return { demoFetch, realFetch, conversation };
}

describe('createDemoFetch', () => {
  it('answers a recorded GET with its JSON', async () => {
    const { demoFetch } = setup();
    const response = await demoFetch('/api/users/me', { credentials: 'include' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ displayName: 'Sam' });
  });

  it('lets the year-in persona override only what it has recorded', async () => {
    const { demoFetch } = setup('oneYear');
    expect(await (await demoFetch('/api/stats/rating?range=all')).json()).toEqual({ games: 3420 });
    expect(await (await demoFetch('/api/users/me')).json()).toEqual({ displayName: 'Sam' });
  });

  it('answers an unrecorded GET with a 404 problem, never by calling the real API', async () => {
    const { demoFetch, realFetch } = setup();
    const response = await demoFetch('/api/games/unknown');
    expect(response.status).toBe(404);
    expect(realFetch).not.toHaveBeenCalled();
  });

  it('refuses every write with a message that says why', async () => {
    const { demoFetch, realFetch } = setup();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await demoFetch('/api/games', { method, body: '{}' });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { title: string }).title).toMatch(/demo/i);
    }
    expect(realFetch).not.toHaveBeenCalled();
  });

  it('tells the page why a write was refused, so the visitor is never left guessing', async () => {
    const onRefused = vi.fn();
    const demoFetch = createDemoFetch({
      fixtures,
      conversation: new DemoConversation(recorded, instant),
      persona: () => 'sixWeeks',
      realFetch: vi.fn(),
      onRefused
    });
    await demoFetch('/api/games/g1', { method: 'DELETE' });
    expect(onRefused).toHaveBeenCalledWith(expect.stringMatching(/read-only demo/i));
  });

  it('says playing needs an account when a game start is refused', async () => {
    const { demoFetch } = setup();
    for (const url of ['/api/sessions/play-bot', '/api/sessions/play']) {
      const response = await demoFetch(url, { method: 'POST', body: '{}' });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { title: string }).title).toMatch(/sign in to play/i);
    }
  });

  it('passes non-API requests (static files) through to the real fetch', async () => {
    const { demoFetch, realFetch } = setup();
    await demoFetch('/brand/logo.png');
    expect(realFetch).toHaveBeenCalledWith('/brand/logo.png', undefined);
  });

  it('serves the coach session with only the messages played so far', async () => {
    const { demoFetch } = setup();
    const before = (await (await demoFetch('/api/sessions/s1')).json()) as { messages: { id: string }[] };
    expect(before.messages.map((m) => m.id)).toEqual(['1']);
    await (await demoFetch('/api/sessions/s1/messages', { method: 'POST', body: JSON.stringify({ content: 'Hello' }) })).text();
    const after = (await (await demoFetch('/api/sessions/s1')).json()) as { messages: { id: string }[] };
    expect(after.messages.map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('answers a coach message with the scripted stream, not a write refusal', async () => {
    const { demoFetch } = setup();
    const response = await demoFetch('/api/sessions/s1/messages', { method: 'POST', body: JSON.stringify({ content: 'Hello' }) });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toContain('Hi Sam.');
  });

  describe('the session while the script is still going', () => {
    const shown = { moveNumber: 32, color: 'white' as const };
    const messages = [
      { id: '1', role: 'assistant' as const, content: [{ type: 'text', text: 'Look.' }, { type: 'tool-call', toolName: 'show_position', input: shown }] },
      { id: '2', role: 'user' as const, content: [{ type: 'text', text: 'Hello' }] },
      { id: '3', role: 'assistant' as const, content: [{ type: 'text', text: 'Hi Sam.' }] }
    ];
    const finished = { id: 's1', status: 'completed', subjectPly: 73, summary: 'You missed a rook.', homework: 'Ask what changed.', messages };
    const setupFinished = () => {
      const conversation = new DemoConversation(messages, instant);
      const demoFetch = createDemoFetch({
        fixtures: { sessionId: 's1', base: { '/api/sessions/s1': finished }, oneYear: {} },
        conversation,
        persona: () => 'sixWeeks',
        realFetch: vi.fn()
      });
      return demoFetch;
    };

    it('is active, without the summary that would give the ending away, and on the position being discussed', async () => {
      const detail = (await (await setupFinished()('/api/sessions/s1')).json()) as Record<string, unknown>;
      expect(detail).toMatchObject({ status: 'active', summary: null, homework: null, subjectPly: 63 });
    });

    it('shows the summary and homework once the conversation is over', async () => {
      const demoFetch = setupFinished();
      await (await demoFetch('/api/sessions/s1/messages', { method: 'POST', body: JSON.stringify({ content: 'Hello' }) })).text();
      const detail = (await (await demoFetch('/api/sessions/s1')).json()) as Record<string, unknown>;
      expect(detail).toMatchObject({ status: 'completed', summary: 'You missed a rook.', homework: 'Ask what changed.' });
    });
  });
});
