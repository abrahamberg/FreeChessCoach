import { useState, type ReactNode } from 'react';
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { useStandaloneDisplay } from '../hooks/useStandaloneDisplay.js';
import { CloseIcon, MaximizeIcon } from './Icon.js';
import './FullscreenPrompt.css';

const DISMISSED_KEY = 'freechesscoach:fullscreen-prompt-dismissed';

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    // Safari private mode throws on localStorage access — worst case the
    // banner just reappears every visit instead of staying dismissed.
    return false;
  }
}

function storeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, 'true');
  } catch {
    // Best effort, see readDismissed.
  }
}

/** A one-time, dismissible nudge toward running full screen on a phone — the
 * browser's own address/nav chrome eats real space from the board on every
 * board route (Review, a coaching session, Play vs Bot), which is exactly
 * where that space matters most. Mounted once in AppShell as a fixed
 * overlay (not an in-flow child) so it shows above *every* mobile page,
 * including board routes that hide AppShell's own top bar, without
 * affecting any page's own height-driven layout math. Silent on desktop and
 * once the app is already running installed/full screen. */
export function FullscreenPrompt(): ReactNode {
  const isDesktop = useIsDesktop();
  const isStandalone = useStandaloneDisplay();
  const { canInstall, promptInstall } = usePwaInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (isDesktop || isStandalone || dismissed) return null;

  function dismiss(): void {
    storeDismissed();
    setDismissed(true);
  }

  // Fullscreen API support is the one signal available for "will tapping
  // this actually hide the browser bar" on a plain (non-installed) tab — a
  // few Android browsers/in-app webviews grant it there, most (and iOS
  // Safari entirely) only allow it once already installed, where this
  // banner never renders anyway (isStandalone above). Best-effort: request
  // is fire-and-forget, a rejection (unsupported/gesture-less) is silent.
  const canRequestFullscreen = typeof document.documentElement.requestFullscreen === 'function';

  async function handlePrimaryAction(): Promise<void> {
    if (canInstall) {
      await promptInstall();
      return;
    }
    if (canRequestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }

  const showPrimaryButton = canInstall || canRequestFullscreen;

  return (
    <div className="fullscreen-prompt" role="status">
      <MaximizeIcon className="fullscreen-prompt__icon" width={18} height={18} />
      <p className="fullscreen-prompt__text">
        {isIos()
          ? 'Tap the Share icon, then Add to Home Screen for a full-screen board, no browser bar.'
          : 'Install FreeChessCoach for a full-screen board, no browser bar.'}
      </p>
      {showPrimaryButton && (
        <button type="button" className="fullscreen-prompt__action" onClick={handlePrimaryAction}>
          {canInstall ? 'Install app' : 'Go full screen'}
        </button>
      )}
      <button type="button" className="fullscreen-prompt__dismiss" aria-label="Dismiss" onClick={dismiss}>
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );
}
