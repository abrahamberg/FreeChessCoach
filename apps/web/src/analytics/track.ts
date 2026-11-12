import type { ImportableGameSource } from '@freechesscoach/shared';
import { getVisitUtm } from './utm.js';

/** Funnel events sent to Google Analytics 4 (the tag is loaded by the site,
 * not by this repo). No other analytics vendor. */
export type FunnelEvent =
  | 'review_started'
  | 'review_completed'
  | 'signin_offer_shown'
  | 'signin_offer_clicked'
  | 'sign_up'
  | 'game_imported';

export type FunnelSource = 'pgn' | 'chesscom' | 'lichess';

/** The two offers of the sign-in panel at the end of a free review. */
export type SignInOffer = 'keep_game' | 'repeat_mistakes';

export interface FunnelParams {
  source: FunnelSource;
  signedIn: boolean;
  /** Only on the sign-in offer's events: which offer was clicked. */
  offer?: SignInOffer;
}

type Gtag = (command: 'event', name: string, params: Record<string, string | boolean>) => void;

/** The import sources the app knows are pasted or uploaded PGN, or a remote site. */
export function funnelSource(source: ImportableGameSource): FunnelSource {
  return source === 'lichess' || source === 'chesscom' ? source : 'pgn';
}

function getGtag(): Gtag | null {
  const candidate = (globalThis as { gtag?: unknown }).gtag;
  return typeof candidate === 'function' ? (candidate as Gtag) : null;
}

/** Sends one funnel event with `source`, `signed_in` and the visit's utm tags.
 * Does nothing when gtag is absent (local dev, blocked, the offline demo). */
export function trackFunnelEvent(name: FunnelEvent, { source, signedIn, offer }: FunnelParams): void {
  const gtag = getGtag();
  if (!gtag) return;
  try {
    gtag('event', name, { source, signed_in: signedIn, ...(offer ? { offer } : {}), ...getVisitUtm() });
  } catch {
    // Analytics must never break the app.
  }
}
