import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { usePwaInstallPrompt } from './usePwaInstallPrompt.js';

describe('usePwaInstallPrompt', () => {
  test('canInstall is false until the browser fires beforeinstallprompt', () => {
    const { result } = renderHook(() => usePwaInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  test('capturing beforeinstallprompt flips canInstall true; promptInstall replays the captured event', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());
    const prompt = vi.fn().mockResolvedValue(undefined);
    const userChoice = Promise.resolve({ outcome: 'accepted' as const });

    act(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
      };
      event.prompt = prompt;
      event.userChoice = userChoice;
      window.dispatchEvent(event);
    });

    expect(result.current.canInstall).toBe(true);

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(result.current.canInstall).toBe(false);
  });

  test('promptInstall is a no-op when nothing was captured', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());
    await expect(result.current.promptInstall()).resolves.toBeUndefined();
  });
});
