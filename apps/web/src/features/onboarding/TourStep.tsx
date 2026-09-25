import type { ReactNode } from 'react';

/** Each card opens the offline live demo (apps/web/src/demo) with `?back=welcome`, so
 * the demo's banner offers a way back to this step (demo/demoReturn.ts). */
const TOUR_STOPS = [
  {
    title: 'Coach chat',
    image: '/shots/coach-session.png',
    demo: '/demo/coach',
    text: 'The coach walks you through a game one question at a time, and only shows the answer when you ask.'
  },
  {
    title: 'Your games',
    image: '/shots/games-library.png',
    demo: '/demo/games',
    text: 'Every game you import is analyzed and kept in one library, ready to review.'
  },
  {
    title: 'Progress',
    image: '/shots/progress-focus.png',
    demo: '/demo/progress',
    text: 'The mistakes you keep repeating become focus areas, so you know what to work on next.'
  },
  {
    title: 'Stats',
    image: '/shots/hero-stats.png',
    demo: '/demo/stats',
    text: 'Rating, openings, tactics and endgames, over time.'
  }
] as const;

export function TourStep(): ReactNode {
  return (
    <div className="onboarding__tour">
      {TOUR_STOPS.map((stop) => (
        <article key={stop.title} className="onboarding__tour-card">
          <a href={`${stop.demo}?back=welcome`} tabIndex={-1} aria-hidden="true">
            <img src={stop.image} alt="" width="1440" height="900" loading="lazy" />
          </a>
          <h3>{stop.title}</h3>
          <p>{stop.text}</p>
          <a className="btn-secondary" href={`${stop.demo}?back=welcome`}>Try it live</a>
        </article>
      ))}
    </div>
  );
}
