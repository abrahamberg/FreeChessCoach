import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { localTtsClient } from './local-tts-client.js';
import { useVoicePreview } from './useVoicePreview.js';

const played: string[] = [];

class FakeAudio {
  src = '';
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play(): Promise<void> {
    played.push(this.src);
    return Promise.resolve();
  }
  pause(): void {}
}

beforeEach(() => {
  played.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:${n++}`, revokeObjectURL: () => {} }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const request = { persona: 'scholar' as const, backend: 'local' as const, text: 'Ah. Why?' };

describe('useVoicePreview', () => {
  test('synthesizes as a preview and plays the sample for its key', async () => {
    const speak = vi.spyOn(localTtsClient, 'speak').mockImplementation(async (_req, onChunk) => {
      onChunk(0, new ArrayBuffer(1));
    });
    const { result } = renderHook(() => useVoicePreview());

    await act(async () => result.current.toggle('coach:scholar', request));

    expect(speak).toHaveBeenCalledWith({ text: 'Ah. Why?', persona: 'scholar', preview: true }, expect.any(Function));
    expect(played).toEqual(['blob:0']);
    expect(result.current.playingKey).toBe('coach:scholar');
  });

  test('pressing the same key again stops it', async () => {
    vi.spyOn(localTtsClient, 'speak').mockImplementation(async (_req, onChunk) => {
      onChunk(0, new ArrayBuffer(1));
    });
    const { result } = renderHook(() => useVoicePreview());
    await act(async () => result.current.toggle('coach:scholar', request));
    await act(async () => result.current.toggle('coach:scholar', request));
    expect(result.current.playingKey).toBeNull();
  });

  test('marks the key failed when synthesis fails', async () => {
    vi.spyOn(localTtsClient, 'speak').mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useVoicePreview());
    await act(async () => result.current.toggle('backend:local', request));
    expect(result.current.failedKey).toBe('backend:local');
    expect(result.current.loadingKey).toBeNull();
  });
});
