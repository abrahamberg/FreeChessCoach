import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getDemoRuntime } from '../demo/demoRuntime.js';
import { useEngineDownloaded } from '../hooks/useEngineDownloaded.js';
import { useEngineStatus } from '../hooks/useEngineStatus.js';
import { useProfile, useUpdateProfile } from '../hooks/useProfile.js';
import { BrowserEngineStatus } from './BrowserEngineStatus.js';
import './ChessApiPauseNotice.css';

function formatUntil(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** A blocking dialog shown while the user is still on the external engine
 * (chess-api.com) after it rate-limited them. It has no close button on
 * purpose: the external engine is switched off for at least 30 minutes, so the
 * user has to pick the engine to use instead. Meanwhile our server engine
 * answers, so nothing is broken. Choosing "my device" never downloads by
 * itself — a follow-up step says the engine must be downloaded and offers it. */
export function ChessApiPauseNotice(): ReactNode {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const engine = useEngineStatus();
  const stored = useEngineDownloaded(engine.status);
  const [pickedBrowser, setPickedBrowser] = useState(false);
  const [carryOn, setCarryOn] = useState(false);

  if (getDemoRuntime() || !profile) return null;
  const pausedUntil = profile.chessApiPausedUntil;
  const mustChoose = profile.engineMode === 'chess_api' && !!pausedUntil && new Date(pausedUntil) > new Date();
  const needsDownload = pickedBrowser && !carryOn && engine.status !== 'ready' && !stored;

  if (mustChoose) return <ChooseEngineDialog pausedUntil={pausedUntil} onPick={(mode) => {
    if (mode === 'browser') setPickedBrowser(true);
    update.mutate({ engineMode: mode });
  }} isPending={update.isPending} isError={update.isError} engine={engine} />;
  if (needsDownload) return <DownloadDialog engine={engine} onLater={() => setCarryOn(true)} />;
  return null;
}

interface ChooseProps {
  pausedUntil: string;
  onPick: (mode: 'browser' | 'native') => void;
  isPending: boolean;
  isError: boolean;
  engine: ReturnType<typeof useEngineStatus>;
}

function ChooseEngineDialog({ pausedUntil, onPick, isPending, isError, engine }: ChooseProps): ReactNode {
  return createPortal(
    <div className="chess-api-notice__backdrop">
      <div className="chess-api-notice" role="alertdialog" aria-modal="true" aria-labelledby="chess-api-notice-title">
        <span className="chess-api-notice__badge">External engine paused</span>
        <h2 id="chess-api-notice-title">The external engine has hit its daily limit</h2>
        <p>
          <strong>What is rate limiting?</strong> Free services cap how much one connection can use them each day, so
          they stay available for everyone. The external engine (chess-api.com) says your daily allowance is used
          up.
        </p>
        <p>
          It is switched off for at least 30 minutes (until about <strong>{formatUntil(pausedUntil)}</strong>). Choose an
          engine to use instead — you can switch back to the external engine in Settings after that.
        </p>
        <div className="chess-api-notice__choices">
          <div className="chess-api-notice__choice chess-api-notice__choice--recommended">
            <span className="chess-api-notice__tag">Recommended</span>
            <strong>Use my device</strong>
            <span>Runs in this browser. No limits, and fast on most computers.</span>
            <BrowserEngineStatus engine={engine} />
            <button type="button" className="chess-api-notice__pick" disabled={isPending} onClick={() => onPick('browser')}>
              Use my device
            </button>
          </div>
          <div className="chess-api-notice__choice">
            <strong>Use our server engine</strong>
            <span>Runs on our servers. Slower when it is busy. Nothing to download.</span>
            <button type="button" className="btn-secondary chess-api-notice__pick" disabled={isPending} onClick={() => onPick('native')}>
              Use our server engine
            </button>
          </div>
        </div>
        {isError && <p role="alert">Could not switch engine — please try again.</p>}
      </div>
    </div>,
    document.body
  );
}

/** After "Use my device" when the engine is not on this device yet. */
function DownloadDialog({ engine, onLater }: { engine: ReturnType<typeof useEngineStatus>; onLater: () => void }): ReactNode {
  return createPortal(
    <div className="chess-api-notice__backdrop">
      <div className="chess-api-notice" role="alertdialog" aria-modal="true" aria-labelledby="engine-download-title">
        <span className="chess-api-notice__badge">One more step</span>
        <h2 id="engine-download-title">Download the engine to your device</h2>
        <p>Your device needs the engine before it can analyze. Until then, our server engine answers, so the app keeps working.</p>
        <BrowserEngineStatus engine={engine} />
        <button type="button" className="btn-secondary chess-api-notice__pick" onClick={onLater}>
          {engine.status === 'installing' ? 'Continue while it downloads' : 'Not now'}
        </button>
      </div>
    </div>,
    document.body
  );
}
