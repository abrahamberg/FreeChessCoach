import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AskCoachPanel } from './AskCoachPanel.js';

vi.mock('../../../hooks/useProfile.js', () => ({ useProfile: () => ({ data: { coachPersona: 'scholar' } }) }));

function sse(chunks: object[]): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('AskCoachPanel', () => {
  test('asks the learner’s own coach about this position and shows the streamed answer', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(sse([{ type: 'start' }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Nc6 hits e5 again.' }, { type: 'text-end', id: 't' }, { type: 'finish' }]))
    );
    vi.stubGlobal('fetch', fetch);
    render(<AskCoachPanel position={{ slug: 'englund-aaaaaaaaaaaa', episodeId: 'e1', nodeId: 'n3' }} />);

    fireEvent.click(screen.getByRole('button', { name: /Ask my coach/ }));
    expect(screen.getByText('Your coach: The Scholar')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Why not Qe7?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('Nc6 hits e5 again.')).toBeTruthy();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/course-questions');
    expect(JSON.parse(String(init.body))).toEqual({ slug: 'englund-aaaaaaaaaaaa', episodeId: 'e1', nodeId: 'n3', messages: [{ role: 'user', content: 'Why not Qe7?' }] });
  });

  test('without an AI setup, points to Settings', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ title: 'Set up your AI in Settings first.', status: 400 }), { status: 400, headers: { 'content-type': 'application/problem+json' } }))));
    render(<AskCoachPanel position={{ slug: 's', episodeId: 'e1', nodeId: null }} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask my coach/ }));
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Why?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('link', { name: 'open Settings' })).toBeTruthy();
  });
});
