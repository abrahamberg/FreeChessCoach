import { COACH_PERSONA_INFO, type CoachPersona } from '@freechesscoach/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import { CoachAvatar } from '../../../components/CoachAvatar.js';
import { ChevronRightIcon, LightbulbIcon } from '../../../components/Icon.js';

export interface CourseRecapProps {
  persona: CoachPersona;
  takeaways: string[];
  nextLabel: string;
  onContinue: () => void;
  onBack: () => void;
}

/** docs/courses.md §11: the course's takeaways on their own screen, between
 * the play-through and Practice. The board is hidden meanwhile so the three
 * lines get the learner's attention, and it fits a phone. */
export function CourseRecap({ persona, takeaways, nextLabel, onContinue, onBack }: CourseRecapProps): ReactNode {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Moves focus (and a phone's scroll) to the top of the recap.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section className="course-recap" aria-labelledby="course-recap-heading">
      <div className="course-recap__coach">
        <CoachAvatar persona={persona} size="header" />
        <span className="course-recap__coach-name">{COACH_PERSONA_INFO[persona].label}</span>
      </div>
      <h2 id="course-recap-heading" ref={headingRef} tabIndex={-1} className="course-recap__heading">
        Remember
      </h2>
      <p className="course-recap__lead">{takeaways.length === 1 ? 'One thing to take with you.' : `${takeaways.length} things to take with you.`}</p>
      <ol className="course-recap__list">
        {takeaways.map((takeaway, index) => (
          <li key={index} className="course-recap__item">
            <span className="course-recap__icon" aria-hidden="true">
              <LightbulbIcon width={20} height={20} />
            </span>
            <span>{takeaway}</span>
          </li>
        ))}
      </ol>
      <p className="course-recap__next">Next, play the moves yourself, with arrows to help at first.</p>
      <div className="course-recap__actions">
        <button type="button" className="btn-primary course-player__next" onClick={onContinue}>
          Continue to {nextLabel}
          <ChevronRightIcon width={16} height={16} />
        </button>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back to the moves
        </button>
      </div>
    </section>
  );
}
