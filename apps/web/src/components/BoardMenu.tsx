import { useState, type ReactNode } from 'react';
import { BugReportModal } from '../features/bug-report/BugReportModal.js';
import { getDemoRuntime } from '../demo/demoRuntime.js';
import { AccountMenuSections } from './AccountMenuSections.js';
import { OverflowMenu, type OverflowMenuItem } from './OverflowMenu.js';
import type { EngineActivityIndicatorState } from '../hooks/useEngineActivityIndicator.js';

export interface BoardMenuProps {
  label: string;
  /** The page's own actions (reset, coach voice, status bar…). */
  items: OverflowMenuItem[];
  engineActivity?: EngineActivityIndicatorState;
}

/** The board views' "⋮" menu. Board routes hide the topbar and its
 * UserMenu, so this is the same account menu (AccountMenuSections) with the
 * page's own actions grouped under the identity header. */
export function BoardMenu({ label, items, engineActivity }: BoardMenuProps): ReactNode {
  const [isReporting, setIsReporting] = useState(false);
  // The demo has no engine, and a red "Engine" dot would only look like a fault.
  const showEngineStatus = getDemoRuntime() === null;

  return (
    <>
      <OverflowMenu
        label={label}
        panelClassName="overflow-menu__items--account"
        renderPanel={(close) => (
          <AccountMenuSections
            engineActivity={showEngineStatus ? engineActivity : undefined}
            onClose={close}
            onReportBug={() => setIsReporting(true)}
          >
            {items.length > 0 && items.map((item) => <BoardMenuItem key={item.label} item={item} onClose={close} />)}
          </AccountMenuSections>
        )}
      />
      {isReporting && <BugReportModal onClose={() => setIsReporting(false)} />}
    </>
  );
}

export function BoardMenuItem({ item, onClose }: { item: OverflowMenuItem; onClose: () => void }): ReactNode {
  const className = item.destructive
    ? 'user-menu__item user-menu__item--button user-menu__item--destructive'
    : 'user-menu__item user-menu__item--button';
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
        item.onSelect();
      }}
    >
      {item.label}
    </button>
  );
}
