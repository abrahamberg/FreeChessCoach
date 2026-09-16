import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ArrowRef } from './arrowToken.js';
import { ArrowRightIcon } from '../../components/Icon.js';
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
}

/** The reply composer, extracted from ChatPane so it can render in two
 * different places: inline at the bottom of ChatPane's own column
 * (desktop), and pinned to the bottom of the screen in SessionPage's
 * mobile paged layout. Always an open text row with a send button, iMessage-
 * style — Daniel's call: no "tap a button to reveal the keyboard" step,
 * since that's not how any chat app anyone already uses actually works, and
 * a plain unfocused text field doesn't summon the keyboard on its own
 * anyway (only focusing it does, which stays a deliberate tap). */
export function ChatComposer({ onSend, boardArrows = NO_ARROWS, hasPendingLine = false }: ChatComposerProps): ReactNode {
  const [parts, setParts] = useState<DraftPart[]>(createEmptyDraft);
  const prevArrowsRef = useRef<ArrowRef[]>([]);

  useEffect(() => {
    // Captured once as a local, not re-read from the ref inside the setParts
    // updater below — updater functions run whenever React gets around to
    // processing the queued state change, which can be after the
    // `prevArrowsRef.current = boardArrows` line further down has already
    // mutated the ref, silently turning every arrow into a no-op diff.
    const previousArrows = prevArrowsRef.current;
    setParts((current) => reconcileArrowChips(current, previousArrows, boardArrows));
    prevArrowsRef.current = boardArrows;
  }, [boardArrows]);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (isDraftEmpty(parts) && !hasPendingLine) return;
    onSend(serializeDraft(parts).trim());
    setParts(createEmptyDraft());
  }

  return (
    <form className="chat-composer" onSubmit={handleSubmit}>
      <ChipReplyInput parts={parts} onChange={setParts} />
      <button type="submit" className="chat-composer__send" aria-label="Send message">
        <ArrowRightIcon width={18} height={18} />
      </button>
    </form>
  );
}
