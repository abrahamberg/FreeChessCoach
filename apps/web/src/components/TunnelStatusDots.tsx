import type { ReactNode } from 'react';
import type { EngineMode } from '@freechesscoach/shared';
import { useEngineTunnelStatusDots, type TunnelDotColor } from '../hooks/useEngineTunnelStatusDots.js';
import './TunnelStatusDots.css';

const DOT_STATUS_TEXT: Record<TunnelDotColor, string> = {
  green: 'connected and ready',
  yellow: 'connected, engine still loading',
  red: 'not connected'
};

function Dot({ label, color }: { label: string; color: TunnelDotColor }): ReactNode {
  return (
    <span
      className={`tunnel-status-dot tunnel-status-dot--${color}`}
      role="status"
      title={`${label}: ${DOT_STATUS_TEXT[color]}`}
    />
  );
}

export interface TunnelStatusDotsProps {
  /** The account's own configured engineMode, same value the engine-mode
   * pill's badge is derived from (useEngineActivityIndicator) — passed in
   * rather than fetched again here so both stay in sync off one source. */
  engineMode: EngineMode | null;
}

/** Two small status dots next to the topbar's engine-mode pill (see
 * AppShell.tsx): one for the lite tunnel supplement's browser worker
 * (always shown — every engineMode can fall back on it) and one for the
 * account's own main browser engine (shown only in Browser mode, since
 * that's the only time it's ever asked to do anything). Both read off the
 * same underlying `/api/engine-tunnel` WebSocket connection but each their
 * own worker's install state — see useEngineTunnelStatusDots for the exact
 * red/yellow/green rule. */
export function TunnelStatusDots({ engineMode }: TunnelStatusDotsProps): ReactNode {
  const dots = useEngineTunnelStatusDots();
  return (
    <span className="tunnel-status-dots">
      <Dot label="Lite engine" color={dots.lite} />
      {engineMode === 'browser' && <Dot label="Browser engine" color={dots.browser} />}
    </span>
  );
}
