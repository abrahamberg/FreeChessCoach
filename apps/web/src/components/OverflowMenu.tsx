import { useEffect, useRef, useState, type ReactNode } from 'react';
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
 * outside click or Escape. */
export function OverflowMenu({ label, items }: OverflowMenuProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
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

  return (
    <div className="overflow-menu" ref={menuRef}>
      <button
        type="button"
        className="overflow-menu__trigger btn-icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
      >
        <MoreVerticalIcon width={17} height={17} />
      </button>
      {isOpen && (
        <div className="overflow-menu__items" role="menu">
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
        </div>
      )}
    </div>
  );
}
