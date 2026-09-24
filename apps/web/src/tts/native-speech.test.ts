import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { speakNative } from './native-speech.js';

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

describe('speakNative', () => {
  const spoken: FakeUtterance[] = [];
  const cancel = vi.fn();

  beforeEach(() => {
    spoken.length = 0;
    cancel.mockClear();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', { speak: (u: FakeUtterance) => spoken.push(u), cancel });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('speaks one utterance per sentence and ends after the last one', () => {
    const onEnd = vi.fn();
    speakNative('First point. Second point.', onEnd);
    expect(spoken.map((u) => u.text)).toEqual(['First point.', 'Second point.']);
    spoken[0]?.onend?.();
    expect(onEnd).not.toHaveBeenCalled();
    spoken[1]?.onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test('never calls onEnd after cancel', () => {
    const onEnd = vi.fn();
    const stop = speakNative('One. Two.', onEnd);
    stop();
    spoken[1]?.onerror?.();
    spoken[1]?.onend?.();
    expect(onEnd).not.toHaveBeenCalled();
  });

  test('ends once when a sentence errors', () => {
    const onEnd = vi.fn();
    speakNative('One. Two.', onEnd);
    spoken[0]?.onerror?.();
    spoken[1]?.onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
