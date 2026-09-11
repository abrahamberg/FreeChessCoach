import { useEffect, useRef, useState } from 'react';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { visibleMessages } from './MessageList.js';

export interface UseMessagePagingResult {
  visible: CoachMessage[];
  index: number;
  current: CoachMessage | undefined;
  total: number;
  goTo: (index: number) => void;
}

/** Backs PagedMessageCard + MessageNavPills: which message (of the same
 * filtered, non-empty transcript MessageList itself renders) is on screen
 * right now. Mirrors MessageList's own "stick to the newest, but never yank
 * the student while they're reading history" rule (design.md §5.3), just in
 * index terms instead of scroll position — jumps to the new latest message
 * only when the student was already viewing the latest one. */
export function useMessagePaging(messages: CoachMessage[]): UseMessagePagingResult {
  const visible = visibleMessages(messages);
  const [index, setIndex] = useState(() => Math.max(visible.length - 1, 0));
  const isAtLatestRef = useRef(true);
  const prevLengthRef = useRef(visible.length);

  useEffect(() => {
    if (visible.length === prevLengthRef.current) return;
    prevLengthRef.current = visible.length;
    if (isAtLatestRef.current) setIndex(Math.max(visible.length - 1, 0));
  }, [visible.length]);

  function goTo(next: number): void {
    const clamped = Math.min(Math.max(next, 0), Math.max(visible.length - 1, 0));
    isAtLatestRef.current = clamped >= visible.length - 1;
    setIndex(clamped);
  }

  const clampedIndex = Math.min(index, Math.max(visible.length - 1, 0));
  return { visible, index: clampedIndex, current: visible[clampedIndex], total: visible.length, goTo };
}
