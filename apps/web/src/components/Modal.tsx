import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icon.js';
import './Modal.css';

export interface ModalProps {
  title: string;
  onClose: () => void;
  /** False keeps the modal open when the backdrop is clicked (Escape and the
   * close button still close it) — for prompts a stray click must not lose. */
  closeOnBackdrop?: boolean;
  children: ReactNode;
}

/** Generic portal-based modal: closes on Escape or backdrop click. No
 * dialog/portal library exists in this app yet — this is the first, meant
 * to be reused by future features rather than rebuilt per-caller. */
export function Modal({ title, onClose, closeOnBackdrop = true, children }: ModalProps): ReactNode {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2>{title}</h2>
          <button type="button" className="modal__close" aria-label="Close" onClick={onClose}>
            <CloseIcon width={17} height={17} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
