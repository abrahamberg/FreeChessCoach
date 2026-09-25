import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createNativeSpeechQueue, speakNative } from './native-speech.js';

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
    vi.stubGlobal('speechSynthesis', {
      speak: (u: FakeUtterance) => spoken.push(u),
      cancel
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('speaks one utterance per sentence and ends after the last one', () => {
    const onEnd = vi.fn();
    speakNative('First point. Second point.', 'general', onEnd);
    expect(spoken.map((u) => u.text)).toEqual(['First point.', 'Second point.']);
    spoken[0]?.onend?.();
    expect(onEnd).not.toHaveBeenCalled();
    spoken[1]?.onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test('never calls onEnd after cancel', () => {
    const onEnd = vi.fn();
    const stop = speakNative('One. Two.', 'general', onEnd);
    stop();
    spoken[1]?.onerror?.();
    spoken[1]?.onend?.();
    expect(onEnd).not.toHaveBeenCalled();
  });

  test('ends once when a sentence errors', () => {
    const onEnd = vi.fn();
    speakNative('One. Two.', 'general', onEnd);
    spoken[0]?.onerror?.();
    spoken[1]?.onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test('a queue keeps speaking sentences appended after it starts and ends once finished', () => {
    const onEnd = vi.fn();
    const queue = createNativeSpeechQueue('general', onEnd);
    queue.append('First point.');
    spoken[0]?.onend?.();
    expect(onEnd).not.toHaveBeenCalled();
    queue.append('Second point.');
    queue.finish();
    expect(spoken.map((u) => u.text)).toEqual(['First point.', 'Second point.']);
    expect(onEnd).not.toHaveBeenCalled();
    spoken[1]?.onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test('a queue finished after its last sentence already played ends right away', () => {
    const onEnd = vi.fn();
    const queue = createNativeSpeechQueue('general', onEnd);
    queue.append('Only point.');
    spoken[0]?.onend?.();
    queue.finish();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
