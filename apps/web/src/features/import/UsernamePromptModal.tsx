import type { ReactNode } from 'react';
import { Modal } from '../../components/Modal.js';
import { PlatformUsernameForm } from '../settings/PlatformUsernameForm.js';
import type { RemoteTab } from './RemoteImportPanel.js';

export interface UsernamePromptModalProps {
  tab: RemoteTab;
  onSave: (username: string) => void;
  onClose: () => void;
  /** Set when the student is correcting an existing name, not adding one. */
  isChange?: boolean;
}

const PLATFORM_NAME: Record<RemoteTab, string> = {
  lichess: 'Lichess',
  chesscom: 'Chess.com'
};

/** Shown the moment a student opens the Lichess/Chess.com import tab without
 * a linked username — importing from either site needs one to tell which
 * side they played, and sending them off to Settings mid-import was a dead
 * end. Reuses PlatformUsernameForm's own save form/flow (PATCH
 * /api/users/me via ImportPage's mutation) rather than a second,
 * import-page-only input. */
export function UsernamePromptModal({ tab, onSave, onClose, isChange = false }: UsernamePromptModalProps): ReactNode {
  const platformName = PLATFORM_NAME[tab];
  return (
    <Modal title={`${isChange ? 'Change' : 'Set'} your ${platformName} username`} onClose={onClose}>
      <p>
        {isChange
          ? `Enter the exact ${platformName} username you play under.`
          : `We need your ${platformName} username to show your recent games and tell which side you played.`}
      </p>
      <PlatformUsernameForm
        platform={tab}
        label={`${platformName} username`}
        value={null}
        onSave={onSave}
        onDelete={() => {}}
      />
    </Modal>
  );
}
