import { useState, type ReactNode } from 'react';
import { ConfirmDialog, type ConfirmDialogProps } from '../components/ConfirmDialog.js';

export type ConfirmRequest = Pick<ConfirmDialogProps, 'title' | 'description' | 'confirmLabel'>;

/** In-app replacement for `window.confirm`: call `confirm(request, action)` to
 * ask, and render the returned `dialog` somewhere in the component's output. */
export function useConfirmDialog(): {
  confirm: (request: ConfirmRequest, onConfirm: () => void) => void;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<{ request: ConfirmRequest; onConfirm: () => void } | null>(null);

  const dialog = pending && (
    <ConfirmDialog
      {...pending.request}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        pending.onConfirm();
        setPending(null);
      }}
    />
  );
  return { confirm: (request, onConfirm) => setPending({ request, onConfirm }), dialog };
}
