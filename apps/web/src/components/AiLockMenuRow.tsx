import type { ReactNode } from 'react';
import { useLlmSetupStatus } from '../hooks/useLlmSetupStatus.js';
import { LockIcon, UnlockIcon } from './Icon.js';

/** The account menus' AI lock status. Locked: a button that opens the unlock
 * popup (the menu's owner holds it, like the bug-report modal). Unlocked: a
 * plain status line. Nothing for an account with no AI setup saved. */
export function AiLockMenuRow({ onUnlock }: { onUnlock: () => void }): ReactNode {
  const status = useLlmSetupStatus().data;
  if (!status?.configured) return null;
  if (status.unlocked) {
    return (
      <div className="user-menu__item user-menu__item--status" role="menuitem" aria-disabled="true">
        <UnlockIcon width={17} height={17} />
        AI unlocked
      </div>
    );
  }
  return (
    <button type="button" role="menuitem" className="user-menu__item user-menu__item--button" onClick={onUnlock}>
      <LockIcon width={17} height={17} />
      AI locked — unlock
    </button>
  );
}
