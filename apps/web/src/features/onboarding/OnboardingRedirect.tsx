import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getDemoRuntime } from '../../demo/demoRuntime.js';
import { useProfile } from '../../hooks/useProfile.js';

/** Sends a brand-new account to /welcome before anything else. The demo has
 * a finished profile and no account, so it never redirects. */
export function OnboardingRedirect({ children }: { children: ReactNode }): ReactNode {
  const { pathname } = useLocation();
  const { data: profile } = useProfile();
  const needsOnboarding = !getDemoRuntime() && profile !== undefined && !profile.onboarded;
  if (needsOnboarding && pathname !== '/welcome') return <Navigate to="/welcome" replace />;
  return children;
}
