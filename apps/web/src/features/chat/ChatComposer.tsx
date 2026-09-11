import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ArrowRef } from './arrowToken.js';
import { CloseIcon, MessageCircleIcon } from '../../components/Icon.js';
import { ChipReplyInput } from './ChipReplyInput.js';
import { createEmptyDraft, isDraftEmpty, reconcileArrowChips, serializeDraft, type DraftPart } from './composerDraft.js';

const NO_ARROWS: ArrowRef[] = [];

export interface ChatComposerProps {
  onSend: (content: string) => void;
  /** design.md §5.7: the student's own right-click-drawn arrows, synced into
   * the reply box as chips — CoachBoard's onArrowsChange, lifted by the
   * parent (SessionPage). */
  boardArrows?: ArrowRef[];
  /** True while a diverged line is pending — Send should be allowed even
   * with an empty text draft, since the line itself (bundled in by the
   * parent's onSend) is the content being submitted. */
  hasPendingLine?: boolean;
  /** Mobile only: the composer starts collapsed behind a trigger button
   * instead of an always-open text row, and opens on tap (auto-focused) —
   * see openComposer/closeComposer below. Desktop's ChatPane keeps the
   * classic always-open input (default false). */
  collapsible?: boolean;
}

/** The reply composer, extracted from ChatPane so it can render in two
 * different places: inline at the bottom of ChatPane's own column
 * (desktop, non-collapsible), and pinned to the bottom of the screen in
 * SessionPage's mobile paged layout (collapsible) — see that page's own
 * doc comment for why the two diverge. */
export function ChatComposer({ onSend, boardArrows = NO_ARROWS, hasPendingLine = false, collapsible = false }: ChatComposerProps): ReactNode {
  const [parts, setParts] = useState<DraftPart[]>(createEmptyDraft);
  const [isComposerOpen, setIsComposerOpen] = useState(!collapsible);
  const prevArrowsRef = useRef<ArrowRef[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  // Only a user gesture (tapping the trigger button, or drawing a board
  // arrow while collapsed) should summon the keyboard — set right before the
  // state flip that reveals the input, and consumed by the focus effect
  // below so opening for any other reason (nothing else does today, but
  // the guard costs nothing) never steals focus unexpectedly.
  const shouldFocusRef = useRef(false);

  useEffect(() => {
    // Captured once as a local, not re-read from the ref inside the setParts
    // updater below — updater functions run whenever React gets around to
    // processing the queued state change, which can be after the
    // `prevArrowsRef.current = boardArrows` line further down has already
    // mutated the ref, silently turning every arrow into a no-op diff.
    const previousArrows = prevArrowsRef.current;
    setParts((current) => reconcileArrowChips(current, previousArrows, boardArrows));
    prevArrowsRef.current = boardArrows;
    if (collapsible && !isComposerOpen && boardArrows.length > previousArrows.length) {
      shouldFocusRef.current = true;
      setIsComposerOpen(true);
    }
  }, [boardArrows, collapsible, isComposerOpen]);

  useEffect(() => {
    if (!isComposerOpen || !shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    const inputs = formRef.current?.querySelectorAll('input');
    inputs?.[inputs.length - 1]?.focus();
  }, [isComposerOpen]);

  function openComposer(): void {
    shouldFocusRef.current = true;
    setIsComposerOpen(true);
  }

  // Blurring every input first is what actually dismisses the on-screen
  // keyboard — collapsing the composer alone wouldn't, since focus would
  // otherwise still sit on an element about to unmount.
  function closeComposer(): void {
    formRef.current?.querySelectorAll('input').forEach((input) => input.blur());
    setIsComposerOpen(false);
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (isDraftEmpty(parts) && !hasPendingLine) return;
    onSend(serializeDraft(parts).trim());
    setParts(createEmptyDraft());
  }

  if (!isComposerOpen) {
    return (
      <button type="button" className="chat-pane__composer-trigger" onClick={openComposer}>
        <MessageCircleIcon width={18} height={18} />
        Ask the coach a question
      </button>
    );
  }

  return (
    <form ref={formRef} className="chat-composer" onSubmit={handleSubmit}>
      <ChipReplyInput parts={parts} onChange={setParts} />
      <button type="submit" className="btn-primary">
        Send
      </button>
      {collapsible && (
        <button type="button" className="chat-pane__composer-close" onClick={closeComposer} aria-label="Close keyboard">
          <CloseIcon width={16} height={16} />
        </button>
      )}
    </form>
  );
}
