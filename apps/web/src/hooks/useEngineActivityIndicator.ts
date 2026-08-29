import { useRef } from 'react';
import type { EngineMode } from '@freechesscoach/shared';
import { useActiveAnalyses } from './useActiveAnalyses.js';
import { useEngineStatus } from './useEngineStatus.js';
import { useSharedEngineActivity } from './useSharedEngineActivity.js';

export type EngineActivityIndicatorState =
  | { kind: 'idle'; engineMode: EngineMode | null }
  | { kind: 'installing'; engineMode: EngineMode | null; percent: number | null }
  | {
      kind: 'analyzing';
      engineMode: EngineMode | null;
      percent: number | null;
      etaText: string | null;
      /** Positions analyzed per second, derived the same way etaText is
       * (client-side, from position-count velocity) — null until there's
       * enough signal to trust a rate. */
      speedPerSec: number | null;
      /** How many of the user's games are in the active-analysis pipeline
       * right now, `primary` (the oldest, currently running) included. */
      count: number;
      /** count - 1: how many more are queued behind the one actually
       * running — what the small queue bar visualizes. */
      queueDepth: number;
    }
  | { kind: 'searching'; engineMode: EngineMode | null; queueLength: number };

/** 'native'/'chess_api' both run server-side ("internal" vs "external" to
 * this deployment); 'browser' runs on the user's own device. Short badge
 * words for the always-visible indicator — EngineModeSelect.tsx has the
 * longer, settings-page-appropriate labels for the same three values. */
export const ENGINE_MODE_BADGE: Record<EngineMode, string> = {
  browser: 'Browser',
  native: 'Internal',
  chess_api: 'External'
};

export function formatSpeed(perSec: number): string {
  if (perSec >= 10) return Math.round(perSec).toString();
  if (perSec >= 1) return trimTrailingZero(perSec.toFixed(1));
  if (perSec >= 0.01) return perSec.toFixed(2);
  return '<0.01';
}

function trimTrailingZero(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

/** The hover/title explanation for the raw speed number — e.g. "1" alone
 * doesn't say whether that's fast or slow. */
export function speedTooltip(perSec: number): string {
  if (perSec >= 1) return `About ${formatSpeed(perSec)} position${perSec === 1 ? '' : 's'} analyzed per second.`;
  const secondsPerPosition = Math.round(1 / perSec);
  return `About 1 position analyzed every ${secondsPerPosition} seconds.`;
}

function formatEta(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 5) return 'a few seconds';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

/** Combines every source of "is the engine doing something right now" into
 * one state for the always-mounted AppShell indicator (see
 * EngineActivityIndicator.tsx): a background game analysis (useActiveAnalyses,
 * durable across reloads via SSE), the shared browser engine's own live
 * search (useSharedEngineActivity — Explore panel, or tunnel fulfillment in
 * browser engine mode), and the one-time WASM download (useEngineStatus).
 * Priority order matches what's most useful to know about: a background
 * analysis (it can take a while and has real progress to show) beats a
 * quick interactive search, which beats a one-time install — and unlike the
 * old version of this hook, `idle` is a real, permanently-displayed state
 * (engine type never disappears), not a "render nothing" sentinel. */
export function useEngineActivityIndicator(): EngineActivityIndicatorState {
  const { engineMode, analyses } = useActiveAnalyses();
  const { status: installStatus, progress: installProgress } = useEngineStatus();
  const localActivity = useSharedEngineActivity();

  // No timestamps travel over the wire (the server only reports a position
  // count) — the ETA/speed are derived client-side from how fast that count
  // has moved since this specific analysis was first observed.
  const rateRef = useRef<{ analysisId: string; startedAt: number; startedAtProgress: number } | null>(null);
  const primary = analyses[0] ?? null;

  if (primary) {
    return { kind: 'analyzing', engineMode, count: analyses.length, queueDepth: analyses.length - 1, ...primaryProgress(primary, rateRef) };
  }

  if (localActivity.searching) {
    // Always the account's own browser tab doing this search (Explore panel,
    // or tunnel fulfillment in browser engine mode — see
    // useSharedEngineActivity's doc comment), regardless of what server-side
    // engineMode the account is actually configured for — 'browser' here,
    // not the account's `engineMode`, is what makes the label match what's
    // really running.
    return { kind: 'searching', engineMode: 'browser', queueLength: localActivity.queueLength };
  }

  if (installStatus === 'installing') {
    return { kind: 'installing', engineMode, percent: installProgress ? Math.round(installProgress.percent * 100) : null };
  }

  return { kind: 'idle', engineMode };
}

function primaryProgress(
  primary: { analysisId: string; status: string; analyzedPositions: number; totalPositions: number },
  rateRef: ReturnType<typeof useRef<{ analysisId: string; startedAt: number; startedAtProgress: number } | null>>
): { percent: number | null; etaText: string | null; speedPerSec: number | null } {
  const percent = primary.totalPositions > 0 ? Math.round((primary.analyzedPositions / primary.totalPositions) * 100) : null;

  if (primary.status !== 'engine_running' || primary.totalPositions <= 0) return { percent, etaText: null, speedPerSec: null };

  const tracked = rateRef.current;
  if (!tracked || tracked.analysisId !== primary.analysisId || primary.analyzedPositions < tracked.startedAtProgress) {
    rateRef.current = { analysisId: primary.analysisId, startedAt: Date.now(), startedAtProgress: primary.analyzedPositions };
    return { percent, etaText: null, speedPerSec: null };
  }

  const elapsedMs = Date.now() - tracked.startedAt;
  const donePositions = primary.analyzedPositions - tracked.startedAtProgress;
  if (elapsedMs < 1500 || donePositions <= 0) return { percent, etaText: null, speedPerSec: null };

  const msPerPosition = elapsedMs / donePositions;
  const remaining = Math.max(0, primary.totalPositions - primary.analyzedPositions);
  return { percent, etaText: formatEta(remaining * msPerPosition), speedPerSec: 1000 / msPerPosition };
}
