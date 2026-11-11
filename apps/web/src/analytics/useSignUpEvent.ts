import { useEffect } from 'react';
import { trackFunnelEvent } from './track.js';

const SENT_KEY = 'fcc:sign-up-sent';

/** Sends `sign_up` once per browser when a brand-new account (not yet through
 * the welcome flow) first loads the app. The source is the one this account
 * has not chosen yet, so it is `pgn`, the neutral value. */
export function useSignUpEvent(isNewAccount: boolean): void {
  useEffect(() => {
    if (!isNewAccount) return;
    try {
      if (localStorage.getItem(SENT_KEY)) return;
      localStorage.setItem(SENT_KEY, '1');
    } catch {
      return;
    }
    trackFunnelEvent('sign_up', { source: 'pgn', signedIn: true });
  }, [isNewAccount]);
}
