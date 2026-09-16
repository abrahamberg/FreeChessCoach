import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVerticalIcon } from './Icon.js';
import './OverflowMenu.css';

export interface OverflowMenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface OverflowMenuProps {
  label: string;
  items: OverflowMenuItem[];
}

/** design-improvements.md §6: destructive actions belong behind an overflow
 * menu, not inline on every row. Generic "..." trigger + dropdown, closes on
 * outside click or Escape.
 *
 * The dropdown itself is portaled to document.body and position: fixed'd to
 * the trigger's own on-open bounding rect — a plain position: absolute
 * child (the original implementation) reads as "on top of everything" only
 * until it sits inside an ancestor that creates its own stacking context
 * (SessionHeader's own backdrop-filter, for one — a real bug this fixes,
 * not a hypothetical): CSS stacking contexts trap z-index, so no z-index
 * value on the dropdown itself can lift it above a later, unrelated sibling
 * of that ancestor (the board/coach card below the header) once that
 * happens. Escaping to document.body sidesteps the whole class of "which
 * ancestor happens to establish a stacking context today" bugs, matching
 * Modal.tsx's own precedent for exactly this problem. */
export function OverflowMenu({ label, items }: OverflowMenuProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function handleTriggerClick(event: React.MouseEvent): void {
    event.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setIsOpen(true);
  }

  return (
    <div className="overflow-menu">
      <button
        ref={triggerRef}
        type="button"
        className="overflow-menu__trigger btn-icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleTriggerClick}
      >
        <MoreVerticalIcon width={17} height={17} />
      </button>
      {isOpen &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            className="overflow-menu__items"
            role="menu"
            style={{ top: position.top, right: position.right }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={item.destructive ? 'overflow-menu__item overflow-menu__item--destructive' : 'overflow-menu__item'}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
