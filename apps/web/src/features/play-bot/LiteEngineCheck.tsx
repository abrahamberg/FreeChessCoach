import type { ReactNode } from 'react';
import { useEngineTunnelStatusDots } from '../../hooks/useEngineTunnelStatusDots.js';
import './LiteEngineCheck.css';

const STATUS_TEXT = {
  green: 'Light engine ready',
  yellow: 'Light engine connecting…',
  red: 'Light engine not connected — the bot will pick from a narrower move pool'
} as const;

/**
 * "Play vs Bot" plan: shown in the pre-game confirm dialog so the student
 * can see, before the game starts, whether the lite browser worker
 * (LiteSupplementedEngineBackend's own supplement — used to widen the bot's
 * candidate pool on the moves where the main engine falls short of lines)
 * is actually reachable. Informational only, never a blocker: that backend
 * already degrades gracefully to the main engine's own result when the lite
 * worker isn't there (see its own doc comment), so Start stays enabled
 * either way.
 */
export function LiteEngineCheck(): ReactNode {
  const { lite } = useEngineTunnelStatusDots();
  return (
    <p className={`lite-engine-check lite-engine-check--${lite}`} role="status">
      <span className="lite-engine-check__dot" aria-hidden="true" />
      {STATUS_TEXT[lite]}
    </p>
  );
}
