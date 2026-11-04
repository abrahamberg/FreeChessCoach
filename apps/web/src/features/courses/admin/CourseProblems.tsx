import type { CourseCheckProblem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';

/** The checks' problems (docs/courses.md §7), each with its episode and move. */
export function CourseProblems({ problems }: { problems: CourseCheckProblem[] }): ReactNode {
  if (!problems.length) return null;
  return (
    <div className="publish-dialog__checks">
      <p>The checks found {problems.length === 1 ? 'one problem' : `${problems.length} problems`}:</p>
      <ul>
        {problems.map((problem, index) => (
          <li key={index}>
            <strong>
              {problem.episode}
              {problem.move ? `, ${problem.move}` : ''}
              {problem.nodeId ? ` (${problem.nodeId})` : ''}
            </strong>
            : {problem.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
