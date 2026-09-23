import { useEffect, useState, type ReactNode } from 'react';
import { claimTunnelActive } from '../engine/tunnel-tab-usage.js';
import { subscribeTunnelConnectionStatus, type TunnelConnectionStatus } from '../engine/tunnel-connection-status.js';
import './TunnelTakeoverGate.css';

/** Blocks the app's page content — never the top bar, so the account menu
 * and nav stay reachable — whenever another of this user's tabs currently
 * holds the tunnel (`tunnel-connection-status.ts`'s `inactive`). Deliberately
 * not a Modal: there is no backdrop/Escape/click-away dismissal, because
 * "dismissing" it would just show an app that can't actually reach the
 * engine or local LLM — the only ways out are the two explicit choices
 * below (unified-tunnel-registry.ts's takeover rule: a tab only gets the
 * tunnel by opening it first, or by explicitly claiming it). */
export function TunnelTakeoverGate({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<TunnelConnectionStatus>('disconnected');
  useEffect(() => subscribeTunnelConnectionStatus(setStatus), []);

  if (status !== 'inactive') return children;
  return <TunnelTakeoverScreen />;
}

function TunnelTakeoverScreen(): ReactNode {
  const [closeFailed, setCloseFailed] = useState(false);

  function handleLeave(): void {
    // Only works for a tab this script itself opened (window.open); a tab
    // the user opened directly (typed URL, bookmark, link click) can't be
    // closed by script — browsers block it silently. Fall back to telling
    // the user it's safe to close by hand.
    window.close();
    setCloseFailed(true);
  }

  return (
    <div className="tunnel-takeover" role="alertdialog" aria-modal="true" aria-labelledby="tunnel-takeover-title">
      <div className="tunnel-takeover__card">
        <h2 id="tunnel-takeover-title">Active on another tab</h2>
        <p>
          There is an active process on another tab. Please wait until it&rsquo;s finished, or take over here to move it to
          this tab.
        </p>
        {closeFailed && <p className="tunnel-takeover__hint">This tab didn&rsquo;t close automatically — you can close it by hand.</p>}
        <div className="tunnel-takeover__actions">
          <button type="button" className="btn-secondary" onClick={handleLeave}>
            Leave
          </button>
          <button type="button" className="btn-primary" onClick={claimTunnelActive}>
            Take over
          </button>
        </div>
      </div>
    </div>
  );
}
