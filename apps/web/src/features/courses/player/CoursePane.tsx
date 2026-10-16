import { COACH_PERSONA_INFO, type CoachPersona } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { CoachAvatar } from '../../../components/CoachAvatar.js';
import { CoachCard } from '../../../components/CoachCard.js';
import { VolumeOffIcon, VolumeOnIcon } from '../../../components/Icon.js';
import '../../chat/ChatPane.css';

export interface CoursePaneProps {
  persona: CoachPersona;
  /** The voice toggle; absent where nothing is voiced (the drills). */
  sound?: { on: boolean; onChange: (on: boolean) => void };
  /** Asking the coach, or the sign-in box: under the note, or on a phone
   * (`footerInHeader`) beside the voice toggle, where it takes no row. */
  footer?: ReactNode;
  footerInHeader?: boolean;
  /** A phone: the coach card every board view there shares (CoachCard), not
   * the desktop column's chat pane. */
  compact?: boolean;
  /** Compact only: what the card's header says beside the portrait (the
   * line's name, the move just played), so the header row earns its place. */
  title?: ReactNode;
  children: ReactNode;
}

/** The course's coach beside the board, in the coaching session's chat pane
 * style: the portrait and name with the round voice toggle, then the note.
 * On a phone it is the shared CoachCard, as in the coaching session and Game
 * Review: the portrait small in the card's header, the toggle beside it, the
 * note below, and "show more" to read a long one. */
export function CoursePane({ persona, sound, footer, footerInHeader = false, compact = false, title, children }: CoursePaneProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const label = sound?.on ? 'Turn the coach’s voice off' : 'Turn the coach’s voice on';
  const toggle = sound && (
    <button type="button" className="chat-pane__voice-toggle" aria-label={label} aria-pressed={sound.on} title={label} onClick={() => sound.onChange(!sound.on)}>
      {sound.on ? <VolumeOnIcon width={25} height={25} /> : <VolumeOffIcon width={25} height={25} />}
    </button>
  );
  if (compact) {
    return (
      <CoachCard
        avatar={<CoachAvatar persona={persona} size="chat" />}
        header={
          <>
            {title && <span className="course-coach-card__title">{title}</span>}
            <span className="course-coach-card__actions">
            {footer && footerInHeader && <span className="course-pane__footer course-pane__footer--header">{footer}</span>}
            {toggle}
            </span>
          </>
        }
        className="course-coach-card"
        expanded={expanded}
        onToggleExpand={() => setExpanded((value) => !value)}
      >
        {children}
        {footer && !footerInHeader && <div className="course-pane__footer">{footer}</div>}
      </CoachCard>
    );
  }
  return (
    <section className="chat-pane course-pane" aria-label="Coach">
      <div className="chat-pane__header">
        <div className="chat-pane__coach-identity">
          <CoachAvatar persona={persona} size="header" />
          <div className="chat-pane__coach-details">
            <strong className="chat-pane__coach-name">{COACH_PERSONA_INFO[persona].label}</strong>
          </div>
        </div>
        {footer && footerInHeader && <div className="course-pane__footer course-pane__footer--header">{footer}</div>}
        {toggle}
      </div>
      <div className="course-pane__body">{children}</div>
      {footer && !footerInHeader && <div className="course-pane__footer">{footer}</div>}
    </section>
  );
}
