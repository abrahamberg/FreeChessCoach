import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ENGINE_MODE_BADGE,
  formatSpeed,
  speedTooltip,
  type EngineActivityIndicatorState
} from '../hooks/useEngineActivityIndicator.js';
import { TunnelStatusDots } from './TunnelStatusDots.js';
import './EngineActivityIndicator.css';

const QUEUE_BAR_MAX = 5;

function badgeFor(engineMode: EngineActivityIndicatorState['engineMode']): string {
  return engineMode ? ENGINE_MODE_BADGE[engineMode] : 'Engine';
}

function QueueBar({ depth, title }: { depth: number; title: string }): ReactNode {
  if (depth <= 0) return null;
  const fillPercent = Math.min(depth, QUEUE_BAR_MAX) / QUEUE_BAR_MAX * 100;
  return (
    <span className="engine-activity-indicator__queue" title={title} aria-hidden="true">
      <span className="engine-activity-indicator__queue-fill" style={{ width: `${fillPercent}%` }} />
    </span>
  );
}

function describe(state: EngineActivityIndicatorState): { label: ReactNode; title: string } {
  const badge = badgeFor(state.engineMode);

  switch (state.kind) {
    case 'idle':
      return {
        label: badge,
        title: `Chess engine: ${badge}. Click to change it in Settings.`
      };
    case 'installing': {
      const pct = state.percent !== null ? ` ${state.percent}%` : '';
      return {
        label: `${badge} · downloading${pct}`,
        title: 'The in-browser chess engine is downloading to this device (one-time, ~108MB).'
      };
    }
    case 'searching':
      return {
        label: (
          <>
            {badge} · searching
            <QueueBar depth={state.queueLength} title={`${state.queueLength} more queued`} />
          </>
        ),
        title:
          state.queueLength > 0
            ? `Your browser's engine is analyzing a position, with ${state.queueLength} more queued behind it.`
            : "Your browser's engine is analyzing a position."
      };
    case 'analyzing': {
      const pct = state.percent !== null ? ` ${state.percent}%` : '';
      const eta = state.etaText ? ` · ~${state.etaText} left` : '';
      const speedText = state.speedPerSec !== null ? ` · ${formatSpeed(state.speedPerSec)}/s` : '';
      const titleParts = [
        `A game is being analyzed by the ${badge.toLowerCase()} chess engine.`,
        state.speedPerSec !== null ? speedTooltip(state.speedPerSec) : null,
        state.queueDepth > 0 ? `${state.queueDepth} more game${state.queueDepth === 1 ? '' : 's'} queued behind it.` : null
      ].filter(Boolean);
      return {
        label: (
          <>
            {badge} · analyzing{pct}
            {speedText}
            {eta}
            <QueueBar depth={state.queueDepth} title={`${state.queueDepth} more queued`} />
          </>
        ),
        title: titleParts.join(' ')
      };
    }
  }
}

export interface EngineActivityIndicatorProps {
  state: EngineActivityIndicatorState;
}

/** design: a small, always-mounted indicator (AppShell topbar) that never
 * disappears — it names the account's configured chess engine (Browser /
 * Internal / External) at rest, and layers on whatever the engine is doing
 * right now (a background game analysis, an interactive Explore search, or
 * the one-time WASM download) when there's something to report. Doubles as
 * a shortcut to Settings' engine picker — the whole pill is a link there.
 * Desktop-only; AppShell embeds the same state into UserMenu on mobile. */
export function EngineActivityIndicator({ state }: EngineActivityIndicatorProps): ReactNode {
  const info = describe(state);

  return (
    <Link to="/settings#settings-engine" className="engine-activity-indicator" title={info.title} aria-live="polite">
      <span className={`engine-activity-indicator__dot${state.kind === 'idle' ? ' engine-activity-indicator__dot--idle' : ''}`} aria-hidden="true" />
      <span className="engine-activity-indicator__label">{info.label}</span>
      <TunnelStatusDots engineMode={state.engineMode} />
    </Link>
  );
}

export { describe as describeEngineActivity };
