import type { ReactNode } from 'react';
import { useUnlockLlmSetup } from '../hooks/useUnlockLlmSetup.js';
import { UnlockPhraseModal } from '../features/settings/UnlockPhraseModal.js';

/** The unlock popup behind the menus' lock row. A coaching session waiting
 * on the unlock retries its own turn once the setup reads as unlocked. */
export function MenuUnlockModal({ onClose }: { onClose: () => void }): ReactNode {
  const unlock = useUnlockLlmSetup();
  return (
    <UnlockPhraseModal
      onClose={onClose}
      onUnlock={unlock.unlock}
      onUnlocked={onClose}
      isPending={unlock.isPending}
      isSuccess={unlock.isSuccess}
      errorMessage={unlock.errorMessage}
    />
  );
}
