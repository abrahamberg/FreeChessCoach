import { COACH_PERSONA_INFO, type CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { CoachAvatar } from '../../../components/CoachAvatar.js';
import { VolumeOffIcon, VolumeOnIcon } from '../../../components/Icon.js';
import '../../chat/ChatPane.css';

export interface CoursePaneProps {
  persona: CoachPersona;
  soundOn: boolean;
  onSoundOn: (on: boolean) => void;
  /** Asking the coach, or the sign-in box: under the note, or on a phone
   * (`footerInHeader`) beside the voice toggle, where it takes no row. */
  footer?: ReactNode;
  footerInHeader?: boolean;
  children: ReactNode;
}

/** The course's coach beside the board, in the coaching session's chat pane
 * style: the portrait and name with the round voice toggle, then the note. */
export function CoursePane({ persona, soundOn, onSoundOn, footer, footerInHeader = false, children }: CoursePaneProps): ReactNode {
  const label = soundOn ? 'Turn the coach’s voice off' : 'Turn the coach’s voice on';
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
        <button type="button" className="chat-pane__voice-toggle" aria-label={label} aria-pressed={soundOn} title={label} onClick={() => onSoundOn(!soundOn)}>
          {soundOn ? <VolumeOnIcon width={25} height={25} /> : <VolumeOffIcon width={25} height={25} />}
        </button>
      </div>
      <div className="course-pane__body">{children}</div>
      {footer && !footerInHeader && <div className="course-pane__footer">{footer}</div>}
    </section>
  );
}
