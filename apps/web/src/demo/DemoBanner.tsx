import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { DemoPersona } from './demoFetch.js';
import { readDemoReturn } from './demoReturn.js';
import { getDemoRuntime, type DemoRuntime } from './demoRuntime.js';
import './demo.css';

/** A slim bar over the whole demo: it says what this is, points at the coach
 * conversation, offers the way out, says why a click did nothing, and (on Stats
 * only) switches between the two sample players. Null outside /demo. */
export function DemoBanner(): ReactNode {
  const runtime = getDemoRuntime();
  const { search } = useLocation();
  if (!runtime) return null;
  const returnTo = readDemoReturn(search);
  return (
    <div className="demo-banner" role="region" aria-label="Demo notice">
      <p className="demo-banner__text">
        <strong>Live demo.</strong> <span className="demo-banner__long">Sample data for a made-up player. Nothing here is saved.</span>
        <span className="demo-banner__short">Sample data.</span> <Link className="demo-banner__coach" to="/coach">Try the coach chat</Link>
      </p>
      <StatsPersonaSwitch runtime={runtime} />
      <span className="demo-banner__links">
        {returnTo ? (
          <a className="demo-banner__coach" href={returnTo}>
            Back to setup
          </a>
        ) : (
          <a className="demo-banner__tour" href="/tour">
            Back to the tour
          </a>
        )}
        <a className="demo-banner__cta" href="/oauth2/start?rd=/games">
          <span className="demo-banner__long">Sign in to use your own games</span>
          <span className="demo-banner__short">Sign in</span>
        </a>
      </span>
      <RefusedNotice runtime={runtime} />
      {returnTo && (
        <a className="demo-back-button" href={returnTo}>
          ← Back to setup
        </a>
      )}
    </div>
  );
}

function RefusedNotice({ runtime }: { runtime: DemoRuntime }): ReactNode {
  const message = useSyncExternalStore(runtime.notice.subscribe, runtime.notice.get);
  if (!message) return null;
  return (
    <p className="demo-banner__notice" role="status">
      {message}
    </p>
  );
}

const PERSONAS: { value: DemoPersona; label: string }[] = [
  { value: 'sixWeeks', label: 'Six weeks in (about 830)' },
  { value: 'oneYear', label: 'A year in (2130)' }
];

function StatsPersonaSwitch({ runtime }: { runtime: DemoRuntime }): ReactNode {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const current = useSyncExternalStore(runtime.persona.subscribe, runtime.persona.get);
  if (pathname !== '/stats') return null;

  function choose(persona: DemoPersona): void {
    runtime.persona.set(persona);
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  }

  return (
    <div className="demo-banner__switch" role="group" aria-label="Sample player">
      <span>Sam:</span>
      {PERSONAS.map((persona) => (
        <button key={persona.value} type="button" aria-pressed={current === persona.value} onClick={() => choose(persona.value)}>
          {persona.label}
        </button>
      ))}
    </div>
  );
}
