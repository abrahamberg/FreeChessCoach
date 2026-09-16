import { useEffect, useState } from 'react';

/** Not in lib.dom — Chrome/Edge/Samsung Internet's own install-prompt event,
 * fired once the browser decides the page qualifies (manifest + service
 * worker/HTTPS) and suppressed (preventDefault) so FullscreenPrompt controls
 * exactly when it re-appears instead of the browser's own mini-infobar. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface UsePwaInstallPromptResult {
  /** True once the browser has offered an install prompt to capture — Safari
   * (iOS/macOS) and Firefox never fire this event, so this stays false there
   * even though "Add to Home Screen" may still exist as a manual step. */
  canInstall: boolean;
  /** Shows the captured native prompt. Resolves once the student answers it
   * (or immediately, a no-op, if none is captured) — safe to call blindly. */
  promptInstall: () => Promise<void>;
}

/** Captures the browser's own install prompt so FullscreenPrompt can trigger
 * it from its own "Install app" button instead of waiting on the browser's
 * mini-infobar (which most students dismiss without noticing what it was
 * for). */
export function usePwaInstallPrompt(): UsePwaInstallPromptResult {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event): void {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  async function promptInstall(): Promise<void> {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    // Each captured event is single-use regardless of outcome.
    setDeferredEvent(null);
  }

  return { canInstall: deferredEvent !== null, promptInstall };
}
