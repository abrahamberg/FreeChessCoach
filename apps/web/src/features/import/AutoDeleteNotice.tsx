import { AUTO_DELETE_BATCH, type ImportQuotaResponse } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';

/** Mirrors the server: an import at the library cap auto-deletes the earliest
 * games first (services/imported-game-record.ts). A batch of `count` reaches
 * that point when it would take the library past the cap. Unknown until the
 * quota loads, so no warning then — the server still deletes regardless. */
export function willAutoDelete(quota: ImportQuotaResponse | undefined, count: number): boolean {
  return quota !== undefined && quota.library.used + count > quota.library.limit;
}

export interface AutoDeleteNoticeProps {
  used: number;
  limit: number;
  /** How many of the earliest games the import will delete. */
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The "we will delete your earliest games" warning, shown before an import
 * that would take the library past its cap — single-game imports included. */
export function AutoDeleteNotice({ used, limit, count, onConfirm, onCancel }: AutoDeleteNoticeProps): ReactNode {
  return (
    <ConfirmDialog
      title="Your library is full"
      description={
        <p>
          You have {used} of {limit} games. Importing will delete your {count} earliest games. Their stats are kept.
        </p>
      }
      confirmLabel="Import and delete"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/** Puts an import behind the notice when it would auto-delete: `guard(count,
 * action)` runs `action` at once if nothing will be deleted, otherwise holds
 * it until the reader confirms. Render `notice` somewhere in the page. */
export function useAutoDeleteNotice(quota: ImportQuotaResponse | undefined) {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  function guard(count: number, action: () => void): void {
    if (willAutoDelete(quota, count)) setPendingAction(() => action);
    else action();
  }

  const notice =
    pendingAction && quota ? (
      <AutoDeleteNotice
        used={quota.library.used}
        limit={quota.library.limit}
        count={AUTO_DELETE_BATCH}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          pendingAction();
          setPendingAction(null);
        }}
      />
    ) : null;

  return { guard, notice };
}
