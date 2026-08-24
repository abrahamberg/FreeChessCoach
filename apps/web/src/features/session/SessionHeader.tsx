import type { ReactNode } from 'react';
import { ArrowLeftIcon } from '../../components/Icon.js';
import { OverflowMenu, type OverflowMenuItem } from '../../components/OverflowMenu.js';
import './SessionHeader.css';

export interface SessionHeaderProps {
  whiteName: string | null;
  blackName: string | null;
  result: string | null;
  onBack: () => void;
  onReset: () => void;
  /** Opens the coach-turn debug panel. Omit to hide the menu item entirely —
   * SessionPage does this outside dev builds (design-improvements.md §3.1/§9,
   * P0: developer tooling must never ship in the production interface).
   * Provided-but-not-yet-usable (no assistant turn has completed) is a
   * `debugDisabled` state, not an omitted item — a menu item that vanishes
   * instead of graying out reads as broken/missing, not "not ready yet". */
  onDebug?: () => void;
  debugDisabled?: boolean;
}

/** design.md §5.1/§5.2: the session's persistent game-context header — back
 * navigation + "White vs. Black  Result" — shown directly under the global
 * top bar while a session is active. Reset (and, in dev builds, the debug
 * trigger) live in the overflow menu rather than the bar itself: reset
 * abandons the session (see coach-agent's resetSession / POST
 * /api/sessions/:id/reset), so it should never sit a stray tap away from
 * the actions the student actually reaches for. */
export function SessionHeader({
  whiteName,
  blackName,
  result,
  onBack,
  onReset,
  onDebug,
  debugDisabled
}: SessionHeaderProps): ReactNode {
  const items: OverflowMenuItem[] = [{ label: 'Reset session', destructive: true, onSelect: onReset }];
  if (onDebug) items.push({ label: 'Debug last answer', onSelect: onDebug, disabled: debugDisabled });

  return (
    <header className="session-header">
      <button type="button" className="session-header__back" onClick={onBack} aria-label="Back to Games">
        <ArrowLeftIcon width={18} height={18} />
      </button>
      <span className="session-header__players">
        {whiteName ?? '?'} <span className="session-header__vs">vs</span> {blackName ?? '?'}
      </span>
      <span className="session-header__actions">
        {result && <span className="badge session-header__result">{result}</span>}
        <OverflowMenu label="Session options" items={items} />
      </span>
    </header>
  );
}
