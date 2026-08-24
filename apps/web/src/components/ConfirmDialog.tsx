import type { ReactNode } from 'react';
import { Modal } from './Modal.js';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  title: string;
  /** Should name the affected item (design-improvements.md §6: "Include the
   * affected game name"). */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive-action confirmation: the primary button is explicitly
 * destructive-styled, never a plain/neutral primary. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel
}: ConfirmDialogProps): ReactNode {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm-dialog__body">{description}</div>
      <div className="confirm-dialog__actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn-destructive btn-destructive--filled" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
