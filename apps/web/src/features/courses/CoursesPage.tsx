import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { describeApiError } from '../../api/client.js';
import { useCourses } from './courseApi.js';
import { COURSE_KIND_INFO } from './courseKinds.js';
import './CourseEditor.css';

/** /courses: the creator's courses, as the API lists them, and the way to
 * start a new one. */
export function CoursesPage(): ReactNode {
  const courses = useCourses();
  const list = courses.data?.courses ?? [];

  return (
    <div className="course-intake">
      <div className="course-intake__header">
        <h1>Your courses</h1>
        <Link to="/courses/new" className="btn-primary">
          New course
        </Link>
      </div>
      {courses.isPending && <p className="meta">Loading…</p>}
      {courses.isError && (
        <p className="course-intake__errors" role="alert">
          {describeApiError(courses.error) ?? 'Could not load your courses.'}
        </p>
      )}
      {courses.isSuccess && !list.length && <p className="meta">No courses yet. Paste a PGN to make your first one.</p>}
      {list.length > 0 && (
        <section className="course-intake__list">
          <ul>
            {list.map((course) => (
              <li key={course.id}>
                <Link to={`/courses/${course.id}/edit`}>{course.title || 'Untitled course'}</Link>
                <span className="meta">
                  {COURSE_KIND_INFO[course.kind].label} · {course.status} · {new Date(course.updatedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
