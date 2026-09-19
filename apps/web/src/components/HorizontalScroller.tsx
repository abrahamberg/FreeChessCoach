import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './Icon.js';
import './HorizontalScroller.css';

export interface HorizontalScrollerProps {
  /** Accessible name for the scrolling region, e.g. "Recently imported games". */
  label: string;
  children: ReactNode;
}

/** A single-row, Netflix-style rail: children sit side by side and slide
 * horizontally (swipe / trackpad / scrollbar-free wheel-drag), with
 * prev/next arrows on pointer devices. Purely presentational — the caller
 * decides what each child looks like and gives each a fixed width. */
export function HorizontalScroller({ label, children }: HorizontalScrollerProps): ReactNode {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const updateEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScrollBack(track.scrollLeft > 1);
    setCanScrollForward(track.scrollLeft + track.clientWidth < track.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateEdges();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(track);
    return () => observer.disconnect();
  }, [updateEdges, children]);

  function scrollByPage(direction: 1 | -1): void {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: 'smooth' });
  }

  return (
    <div className="h-scroller">
      <button
        type="button"
        className="h-scroller__arrow h-scroller__arrow--back"
        aria-label="Scroll back"
        disabled={!canScrollBack}
        onClick={() => scrollByPage(-1)}
      >
        <ChevronLeftIcon width={18} height={18} />
      </button>
      <div ref={trackRef} className="h-scroller__track" role="group" aria-label={label} onScroll={updateEdges}>
        {children}
      </div>
      <button
        type="button"
        className="h-scroller__arrow h-scroller__arrow--forward"
        aria-label="Scroll forward"
        disabled={!canScrollForward}
        onClick={() => scrollByPage(1)}
      >
        <ChevronRightIcon width={18} height={18} />
      </button>
    </div>
  );
}
