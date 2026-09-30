import { COURSE_STAGES, type CourseStage } from '@freechesscoach/chess-analysis';
import type { ReactNode } from 'react';
import { CheckIcon } from '../../../components/Icon.js';

export const STAGE_LABELS: Record<CourseStage, string> = {
  play_through: 'Play through',
  practice: 'Practice',
  drill: 'Drill',
  full_drill: 'Both sides'
};

export interface CourseStageBarProps {
  current: CourseStage;
  done: ReadonlySet<CourseStage>;
  onSelect: (stage: CourseStage) => void;
}

/** docs/courses.md §11: the four stages of a course. Finished ones are
 * ticked; the first unfinished one is suggested; any can be opened. */
export function CourseStageBar({ current, done, onSelect }: CourseStageBarProps): ReactNode {
  const suggested = COURSE_STAGES.find((stage) => !done.has(stage));
  return (
    <nav className="course-stages" aria-label="Stages">
      <ol>
        {COURSE_STAGES.map((stage, index) => {
          const classes = ['course-stages__step'];
          if (stage === current) classes.push('course-stages__step--current');
          else if (stage === suggested) classes.push('course-stages__step--next');
          if (done.has(stage)) classes.push('course-stages__step--done');
          return (
            <li key={stage}>
              <button type="button" className={classes.join(' ')} aria-current={stage === current ? 'step' : undefined} onClick={() => onSelect(stage)}>
                <span className="course-stages__number" aria-hidden="true">
                  {done.has(stage) ? <CheckIcon width={14} height={14} /> : index + 1}
                </span>
                {STAGE_LABELS[stage]}
                {done.has(stage) && <span className="visually-hidden">{', done'}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
