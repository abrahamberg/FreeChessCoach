import type { ReactNode } from 'react';
import type { EngineMode } from '@freechesscoach/shared';
import { useEngineTunnelStatusDots, type TunnelDotColor } from '../hooks/useEngineTunnelStatusDots.js';
import { useLlmSetupStatus } from '../hooks/useLlmSetupStatus.js';
import './TunnelStatusDots.css';

const DOT_STATUS_TEXT: Record<TunnelDotColor, string> = {
  green: 'connected and ready',
  yellow: 'connecting, or engine still loading',
  red: 'not connected',
  grey: 'inactive, another of your tabs is handling requests'
};

const LOCAL_AI_STATUS_TEXT: Record<TunnelDotColor, string> = {
  green: 'your local AI server answered',
  yellow: 'not used yet in this tab',
  red: 'not reachable from this tab',
  grey: 'inactive, another of your tabs is handling requests'
};

function Dot({ label, color, text = DOT_STATUS_TEXT }: { label: string; color: TunnelDotColor; text?: Record<TunnelDotColor, string> }): ReactNode {
  return (
    <span
      className={`tunnel-status-dot tunnel-status-dot--${color}`}
      role="status"
      title={`${label}: ${text[color]}`}
    />
  );
}

export interface TunnelStatusDotsProps {
  /** The account's own configured engineMode, same value the engine-mode
   * pill's badge is derived from (useEngineActivityIndicator) — passed in
   * rather than fetched again here so both stay in sync off one source. */
  engineMode: EngineMode | null;
}

/** Small status dots next to the topbar's engine-mode pill (see
 * AppShell.tsx), all over the one `/api/tunnel` WebSocket: the tunnel itself
 * via the lite engine (always shown — every engineMode can fall back on it),
 * the account's main browser engine (Browser mode only), and the local AI
 * server (local AI setups only). See useEngineTunnelStatusDots for the
 * red/yellow/green rules. With several tabs open, the ones not handling
 * requests show grey dots and the word "inactive". */
export function TunnelStatusDots({ engineMode }: TunnelStatusDotsProps): ReactNode {
  const dots = useEngineTunnelStatusDots();
  const usesLocalAi = useLlmSetupStatus().data?.protocol === 'local';
  return (
    <span className="tunnel-status-dots">
      <Dot label="Tunnel (lite engine)" color={dots.lite} />
      {engineMode === 'browser' && <Dot label="Browser engine" color={dots.browser} />}
      {usesLocalAi && <Dot label="Local AI" color={dots.localAi} text={LOCAL_AI_STATUS_TEXT} />}
      {dots.inactive && (
        <span className="tunnel-status-dots__label" title="Another of your tabs was used more recently and handles engine and AI requests. Click here to make this tab the active one.">
          inactive
        </span>
      )}
    </span>
  );
}
