import { afterEach, describe, expect, test, vi } from 'vitest';
import { effectiveTtsBackend } from './effective-tts-backend.js';

afterEach(() => vi.unstubAllGlobals());

describe('effectiveTtsBackend', () => {
  test('keeps an explicit choice, and openai when it is available', () => {
    expect(effectiveTtsBackend('local', false)).toBe('local');
    expect(effectiveTtsBackend('openai', true)).toBe('openai');
  });

  test('without OpenAI voice, the default becomes the device voice when the browser has one', () => {
    vi.stubGlobal('speechSynthesis', {});
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
    expect(effectiveTtsBackend('openai', false)).toBe('native');
  });

  test('and the browser voice when it does not', () => {
    vi.stubGlobal('window', {});
    expect(effectiveTtsBackend('openai', false)).toBe('browser');
  });
});
