import { useCallback, useEffect, useRef, useState } from 'react';
import { useLlmSetupStatus } from './useLlmSetupStatus.js';
import { useUnlockLlmSetup } from './useUnlockLlmSetup.js';

/** The locked-AI popup of a coaching session, shared by the game and puzzle
 * sessions. A turn that failed on a locked setup parks its `retry` here: it
 * runs once the setup is unlocked — through this popup, or through the
 * menus' lock row — so a session never stays unstarted after the unlock. */
export function useUnlockPrompt() {
  const unlock = useUnlockLlmSetup();
  const statusQuery = useLlmSetupStatus();
  const [isOpen, setIsOpen] = useState(false);
  const pendingRetryRef = useRef<(() => Promise<void>) | null>(null);

  const handleUnlockRequired = useCallback((retry: () => Promise<void>) => {
    pendingRetryRef.current = retry;
    setIsOpen(true);
  }, []);

  const runPendingRetry = useCallback(() => {
    const retry = pendingRetryRef.current;
    pendingRetryRef.current = null;
    void retry?.();
  }, []);

  const isUnlocked = statusQuery.data?.unlocked === true;
  useEffect(() => {
    if (!isUnlocked || isOpen) return;
    runPendingRetry();
  }, [isUnlocked, isOpen, runPendingRetry]);

  const modal = {
    isOpen,
    isPending: unlock.isPending,
    isSuccess: unlock.isSuccess,
    errorMessage: unlock.errorMessage,
    onUnlock: unlock.unlock,
    onClose: () => {
      setIsOpen(false);
      unlock.reset();
    },
    onUnlocked: () => {
      setIsOpen(false);
      unlock.reset();
      runPendingRetry();
    }
  };
  return { handleUnlockRequired, modal };
}
