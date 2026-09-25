import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CoachMessage } from './useCoachChat.js';
import { useCoachVoice, type UseCoachVoiceOptions } from './useCoachVoice.js';

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function coach(id: string, text: string): CoachMessage {
  return { id, role: 'assistant', text };
}

describe('useCoachVoice autoplay while a reply streams in', () => {
  const spoken: FakeUtterance[] = [];

  beforeEach(() => {
    spoken.length = 0;
    window.localStorage.setItem('freechesscoach:coach-voice-autoplay', 'true');
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      speak: (u: FakeUtterance) => spoken.push(u),
      cancel: vi.fn(),
      getVoices: () => []
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  function renderVoice(initial: Pick<UseCoachVoiceOptions, 'messages' | 'isStreaming'>) {
    return renderHook(
      (props: Pick<UseCoachVoiceOptions, 'messages' | 'isStreaming'>) =>
        useCoachVoice({
          ...props,
          persona: 'general',
          enabled: true,
          backend: 'native'
        }),
      { initialProps: initial }
    );
  }

  test('speaks the first sentence before the turn finishes, and the rest once it does', () => {
    const { rerender } = renderVoice({ messages: [], isStreaming: false });
    rerender({ messages: [coach('a', '')], isStreaming: true });
    rerender({
      messages: [coach('a', 'Nice move. Now what')],
      isStreaming: true
    });
    expect(spoken.map((u) => u.text)).toEqual(['Nice move.']);

    rerender({
      messages: [coach('a', 'Nice move. Now what does the knight want?')],
      isStreaming: true
    });
    expect(spoken.map((u) => u.text)).toEqual(['Nice move.']);

    rerender({
      messages: [coach('a', 'Nice move. Now what does the knight want?')],
      isStreaming: false
    });
    expect(spoken.map((u) => u.text)).toEqual(['Nice move.', 'Now what does the knight want?']);
  });

  test('does not read session history aloud', () => {
    renderVoice({
      messages: [coach('old', 'Welcome back. Ready?')],
      isStreaming: false
    });
    expect(spoken).toEqual([]);
  });

  test('finishes a reply once a later coach reply starts, even mid-turn', () => {
    const { rerender } = renderVoice({ messages: [], isStreaming: false });
    rerender({
      messages: [coach('a', 'Look at the board')],
      isStreaming: true
    });
    expect(spoken).toEqual([]);
    rerender({
      messages: [coach('a', 'Look at the board'), coach('b', 'Here')],
      isStreaming: true
    });
    expect(spoken.map((u) => u.text)).toEqual(['Look at the board']);
  });
});
