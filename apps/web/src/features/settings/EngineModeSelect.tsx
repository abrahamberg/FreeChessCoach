import { ENGINE_MODES, type EngineMode } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { BrowserEngineStatus } from '../../components/BrowserEngineStatus.js';
import { useEngineStatus } from '../../hooks/useEngineStatus.js';
import '../../components/RadioCard.css';
import './EngineModeSelect.css';

export interface EngineModeSelectProps {
  value: EngineMode;
  onChange: (mode: EngineMode) => void;
  /** ISO time the external engine is paused until after a rate limit, if it is. */
  chessApiPausedUntil?: string | null;
}

const ENGINE_MODE_LABELS: Record<EngineMode, string> = {
  chess_api: 'External engine (default) — a free cloud chess engine',
  native: 'Our server engine (slower) — runs on our infrastructure',
  browser: 'Your device, performance  depends on your device'
};

/** design spec 2026-08-08 §9: lets a user opt into running the coach's
 * chess engine in their own browser tab instead of the server's.
 *
 * The on-device engine is a ~108MB download, so its state (not downloaded,
 * downloading, downloaded) is always shown under the options and the download
 * only ever starts from its button.
 */
export function EngineModeSelect({ value, onChange, chessApiPausedUntil }: EngineModeSelectProps): ReactNode {
  const engine = useEngineStatus();

  return (
    <div role="radiogroup" aria-label="Engine mode" className="radio-card-group">
      {ENGINE_MODES.map((mode) => (
        <label key={mode} className="radio-card">
          <input
            type="radio"
            name="engine-mode"
            checked={value === mode}
            disabled={mode === 'chess_api' && isPaused(chessApiPausedUntil)}
            onChange={() => onChange(mode)}
          />
          {ENGINE_MODE_LABELS[mode]}
          {mode === 'chess_api' && isPaused(chessApiPausedUntil) && (
            <small> — switched off after hitting its daily limit; available again after {pausedUntilText(chessApiPausedUntil)}</small>
          )}
        </label>
      ))}
      <BrowserEngineStatus engine={engine} />
    </div>
  );
}

function isPaused(until: string | null | undefined): until is string {
  return !!until && new Date(until) > new Date();
}

function pausedUntilText(until: string): string {
  return new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
