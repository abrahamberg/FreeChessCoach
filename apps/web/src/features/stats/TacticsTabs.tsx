import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export type TacticsTab = 'found' | 'prevented';

const TAB_ORDER: TacticsTab[] = ['found', 'prevented'];
const TAB_LABELS: Record<TacticsTab, string> = { found: 'Should Play', prevented: 'Prevented' };

export const TACTICS_TAB_IDS: Record<TacticsTab, string> = {
  found: 'tactics-tab-found',
  prevented: 'tactics-tab-prevented'
};
export const TACTICS_PANEL_IDS: Record<TacticsTab, string> = {
  found: 'tactics-panel-found',
  prevented: 'tactics-panel-prevented'
};

export interface TacticsTabsProps {
  tab: TacticsTab;
  onSelect: (tab: TacticsTab) => void;
}

/**
 * "Should Play" / "Prevented" switcher for the stats dashboard's Tactics
 * card — same role="tablist"/role="tab" + roving-tabindex + arrow-key
 * pattern as SessionViewTabs (apps/web/src/features/session/). Down from a
 * 3rd "Played" tab (removed): that tab tallied tactics executed regardless
 * of engine-line match, which duplicated "Should Play"'s own opportunities/
 * found pair in the user's mental model without a distinct percentage of
 * its own — see the removed computeTacticMotifPlayed for the prior
 * semantics.
 */
export function TacticsTabs({ tab, onSelect }: TacticsTabsProps): ReactNode {
  const foundRef = useRef<HTMLButtonElement>(null);
  const preventedRef = useRef<HTMLButtonElement>(null);
  const tabRefs: Record<TacticsTab, React.RefObject<HTMLButtonElement | null>> = {
    found: foundRef,
    prevented: preventedRef
  };

  function moveTo(next: TacticsTab): void {
    onSelect(next);
    tabRefs[next].current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = TAB_ORDER.indexOf(tab);
    if (event.key === 'ArrowRight') return moveTo(TAB_ORDER[(index + 1) % TAB_ORDER.length]!);
    if (event.key === 'ArrowLeft') return moveTo(TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length]!);
  }

  return (
    <div className="tactics-tabs" role="tablist" aria-label="Tactics view" onKeyDown={handleKeyDown}>
      {TAB_ORDER.map((id) => (
        <button
          key={id}
          ref={tabRefs[id]}
          type="button"
          role="tab"
          id={TACTICS_TAB_IDS[id]}
          aria-selected={tab === id}
          aria-controls={TACTICS_PANEL_IDS[id]}
          tabIndex={tab === id ? 0 : -1}
          onClick={() => onSelect(id)}
        >
          {TAB_LABELS[id]}
        </button>
      ))}
    </div>
  );
}
