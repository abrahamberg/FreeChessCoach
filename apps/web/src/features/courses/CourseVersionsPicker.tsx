import type { CourseVersions } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import './CourseVersionsPicker.css';

type Choice = 'both' | 'long' | 'short';

const CHOICES: { value: Choice; label: string; versions: CourseVersions }[] = [
  { value: 'both', label: 'Course and clip', versions: { long: true, short: true } },
  { value: 'long', label: 'Course', versions: { long: true, short: false } },
  { value: 'short', label: 'Clip', versions: { long: false, short: true } }
];

const SUMMARY: Record<Choice, string> = {
  both: 'The coach speaks on the board, and in a short video made from the same moves.',
  long: 'The coach speaks on the board, move by move. You can add a clip by hand later.',
  short: 'A short video with the coach’s voice. You can add the course’s words by hand later.'
};

function choiceOf(versions: CourseVersions): Choice {
  return versions.long && versions.short ? 'both' : versions.long ? 'long' : 'short';
}

/** Phase 91: what the AI plans and writes, the course (long), the clip
 * (short) or both. The intake and the editor's Details card share it. */
export function CourseVersionsPicker({ value, onChange, label = 'What to make' }: { value: CourseVersions; onChange: (versions: CourseVersions) => void; label?: string }): ReactNode {
  const chosen = choiceOf(value);
  return (
    <div className="course-versions">
      <span className="course-versions__label">{label}</span>
      <div className="course-versions__options" role="group" aria-label={label}>
        {CHOICES.map((choice) => (
          <button key={choice.value} type="button" className="course-versions__option" aria-pressed={chosen === choice.value} onClick={() => onChange(choice.versions)}>
            {choice.label}
          </button>
        ))}
      </div>
      <span className="meta">{SUMMARY[chosen]}</span>
    </div>
  );
}
