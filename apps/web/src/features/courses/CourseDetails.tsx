import { ALL_DIAGNOSIS_CODES, bandForRating, COACH_PERSONA_INFO, courseVideos, DIAGNOSIS_CODES_BY_ID, levelCode, type CourseDocument } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { Modal } from '../../components/Modal.js';
import { BAND_LABELS } from '../settings/BandSelect.js';
import { CoachPersonaSelect } from '../settings/CoachPersonaSelect.js';
import { CourseVideosPicker } from './CourseVideosPicker.js';

const RATINGS = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200];
const CATALOGUE = ALL_DIAGNOSIS_CODES.filter((entry) => entry.detectability !== 'unsupported');

export interface CourseDetailsProps {
  document: CourseDocument;
  onChange: (document: CourseDocument) => void;
}

/** The editor's Details card (Phase 90): the promise, the course coach
 * (their portrait; change it, and the voice changes with them) and the
 * level ("1200-01"), which sorts the course on the Courses page; and the
 * videos besides the course (§13.1), for the next writing. */
export function CourseDetails({ document, onChange }: CourseDetailsProps): ReactNode {
  const [choosing, setChoosing] = useState(false);
  const [changedCoach, setChangedCoach] = useState(false);
  const coach = COACH_PERSONA_INFO[document.coachPersona];
  const level = document.level;

  return (
    <section className="course-panel course-details" aria-label="Course details">
      <div className="course-details__column">
        <h3>Coach and level</h3>
        <div className="course-details__coach">
          <CoachAvatar persona={document.coachPersona} size="chat" />
          <span className="course-details__coach-name">
            <span className="meta">Course coach</span>
            <strong>{coach.label}</strong>
          </span>
          <button type="button" className="btn-secondary course-details__change" onClick={() => setChoosing(true)}>
            Change
          </button>
        </div>
        {changedCoach && <p className="meta course-details__hint">The voice changes now. To make the words sound like {coach.label}, start over and write it again with AI.</p>}

        <div className="course-details__level">
          <label className="course-field">
            <span>Rating</span>
            <select
              value={level?.rating ?? ''}
              onChange={(event) => {
                const rating = Number(event.target.value);
                onChange({ ...document, level: { rating, order: level?.order ?? 1 }, levelBand: bandForRating(rating) });
              }}
            >
              {!level && <option value="">Not set</option>}
              {RATINGS.map((rating) => (
                <option key={rating} value={rating}>
                  {rating}
                </option>
              ))}
            </select>
          </label>
          <label className="course-field">
            <span>Place</span>
            <input
              type="number"
              min={1}
              max={99}
              value={level?.order ?? ''}
              disabled={!level}
              onChange={(event) => level && onChange({ ...document, level: { ...level, order: Math.min(Math.max(Number(event.target.value) || 1, 1), 99) } })}
            />
          </label>
          <span className="course-details__code">{level ? levelCode(level) : '—'}</span>
        </div>
        <p className="meta">Written for: {BAND_LABELS[document.levelBand]}.</p>
      </div>

      <div className="course-details__column">
        <h3>What it makes and promises</h3>
        <CourseVideosPicker value={courseVideos(document)} onChange={(videos) => onChange({ ...document, videos })} />

        <label className="course-field">
          <span>Promise</span>
          <textarea rows={3} value={document.promise} placeholder="After this you can …" onChange={(event) => onChange({ ...document, promise: event.target.value })} />
        </label>
      </div>

      <div className="course-details__column course-details__codes">
        <h3>Weaknesses it trains</h3>
        <ul className="course-details__code-list">
          {document.diagnosisCodes.map((code) => (
            <li key={code} className="course-details__code-chip">
              <span>
                {code} · {DIAGNOSIS_CODES_BY_ID.get(code)?.label ?? code}
              </span>
              <button
                type="button"
                className="btn-ghost"
                aria-label={`Remove ${code}`}
                onClick={() => onChange({ ...document, diagnosisCodes: document.diagnosisCodes.filter((each) => each !== code) })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {document.diagnosisCodes.length === 0 && <p className="meta">None found from the moves. Add one if the course trains a known weakness.</p>}
        <label className="course-field">
          <span>Add a weakness</span>
          <select
            value=""
            onChange={(event) => {
              const code = CATALOGUE.find((entry) => entry.id === event.target.value)?.id;
              if (code && !document.diagnosisCodes.includes(code)) onChange({ ...document, diagnosisCodes: [...document.diagnosisCodes, code] });
            }}
          >
            <option value="">Choose from the catalogue…</option>
            {CATALOGUE.filter((entry) => !document.diagnosisCodes.includes(entry.id)).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id} · {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {choosing && (
        <Modal title="The course coach" onClose={() => setChoosing(false)}>
          <CoachPersonaSelect
            value={document.coachPersona}
            onChange={(persona) => {
              if (persona !== document.coachPersona) {
                onChange({ ...document, coachPersona: persona });
                setChangedCoach(true);
              }
              setChoosing(false);
            }}
          />
        </Modal>
      )}
    </section>
  );
}
