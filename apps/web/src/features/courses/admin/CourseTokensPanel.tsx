import { useState, type ReactNode } from 'react';
import { describeApiError } from '../../../api/client.js';
import { shortDate } from '../../games/gameDisplay.js';
import { useCourseTokens, useCreateCourseToken, useRevokeCourseToken } from './courseAdminApi.js';
import './CourseAdmin.css';

/** docs/courses.md §2: the editor's tokens for the course API. A tool
 * holding one (the studio) imports and publishes as this editor at
 * `/api/token/courses`; the token is shown once. */
export function CourseTokensPanel(): ReactNode {
  const tokens = useCourseTokens();
  const create = useCreateCourseToken();
  const revoke = useRevokeCourseToken();
  const [name, setName] = useState('studio');
  const error = create.error ?? revoke.error;

  return (
    <section className="card course-admin__section" aria-label="API tokens">
      <h2>API tokens</h2>
      <p className="courses-home__empty">A token lets a tool you run (the studio) import, check and publish courses as you, at /api/token/courses. Keep it in a file only that tool reads.</p>
      <form
        className="course-admin__row"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(name.trim());
        }}
      >
        <label className="course-field course-field--grow">
          <span>Name</span>
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={create.isPending || !name.trim()}>
          Make a token
        </button>
      </form>
      {create.data && (
        <div role="status">
          <p className="meta">Copy it now; it is not shown again.</p>
          <p className="course-admin__secret">{create.data.token}</p>
        </div>
      )}
      {error && (
        <p className="course-admin__error" role="alert">
          {describeApiError(error) ?? 'Could not change the tokens.'}
        </p>
      )}
      {tokens.data && tokens.data.tokens.length > 0 && (
        <ul className="course-admin__tokens">
          {tokens.data.tokens.map((token) => (
            <li key={token.id}>
              <span>
                <strong>{token.name}</strong>
                <span className="meta"> · made {shortDate(token.createdAt)} · {token.lastUsedAt ? `last used ${shortDate(token.lastUsedAt)}` : 'never used'}</span>
              </span>
              <button type="button" className="btn-secondary" disabled={revoke.isPending} onClick={() => revoke.mutate(token.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
