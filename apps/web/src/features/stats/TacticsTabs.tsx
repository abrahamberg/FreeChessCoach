import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export type TacticsTab = 'played' | 'found' | 'prevented';

const TAB_ORDER: TacticsTab[] = ['played', 'found', 'prevented'];
const TAB_LABELS: Record<TacticsTab, string> = { played: 'Played', found: 'Found', prevented: 'Prevented' };

export const TACTICS_TAB_IDS: Record<TacticsTab, string> = {
  played: 'tactics-tab-played',
  found: 'tactics-tab-found',
  prevented: 'tactics-tab-prevented'
};
export const TACTICS_PANEL_IDS: Record<TacticsTab, string> = {
  played: 'tactics-panel-played',
  found: 'tactics-panel-found',
  prevented: 'tactics-panel-prevented'
};

export interface TacticsTabsProps {
  tab: TacticsTab;
  onSelect: (tab: TacticsTab) => void;
}

/**
 * Played / Found / Prevented switcher for the stats dashboard's Tactics
 * card — same role="tablist"/role="tab" + roving-tabindex + arrow-key
 * pattern as SessionViewTabs (apps/web/src/features/session/), generalized
 * from 2 tabs to 3. Skips that component's sliding indicator: a single
 * 3-tab caller doesn't earn a --tab-count CSS abstraction, so this uses a
 * plain aria-selected background swap instead.
 */
export function TacticsTabs({ tab, onSelect }: TacticsTabsProps): ReactNode {
  const playedRef = useRef<HTMLButtonElement>(null);
  const foundRef = useRef<HTMLButtonElement>(null);
  const preventedRef = useRef<HTMLButtonElement>(null);
  const tabRefs: Record<TacticsTab, React.RefObject<HTMLButtonElement | null>> = {
    played: playedRef,
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
