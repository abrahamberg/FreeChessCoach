import { inferLearnerSide, parseCourseTree } from '@freechesscoach/chess-analysis';
import {
  COACH_PERSONA_INFO,
  COACH_PERSONAS,
  COURSE_KINDS,
  RATING_BANDS,
  type CoachPersona,
  type CourseKind,
  type RatingBand
} from '@freechesscoach/shared';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { describeApiError } from '../../api/client.js';
import { useProfile } from '../../hooks/useProfile.js';
import { useCreateCourse } from './courseApi.js';
import { BAND_LABELS } from '../settings/BandSelect.js';
import { COURSE_KIND_INFO } from './courseKinds.js';
import './CourseEditor.css';

type SideChoice = 'auto' | 'white' | 'black';

/** Both default coaches are labelled "Coach"; the voice tells them apart. */
function personaLabel(persona: CoachPersona): string {
  const info = COACH_PERSONA_INFO[persona];
  return persona === 'general' || persona === 'general_female' ? `${info.label} (${info.voiceProfile.split(',')[0]!.toLowerCase()} voice)` : info.label;
}

/** docs/courses.md §5.3: only what the AI can't infer. The learner side is
 * pre-filled by the same inference the server runs. */
export function CourseIntakePage(): ReactNode {
  const navigate = useNavigate();
  const profile = useProfile();
  const create = useCreateCourse();
  const [pgn, setPgn] = useState('');
  const [kind, setKind] = useState<CourseKind>('trap');
  const [direction, setDirection] = useState('');
  const [levelBand, setLevelBand] = useState<RatingBand>('improving');
  const [side, setSide] = useState<SideChoice>('auto');
  const [persona, setPersona] = useState<CoachPersona | null>(null);
  const coachPersona = persona ?? profile.data?.coachPersona ?? 'general';

  const parsed = useMemo(() => {
    if (!pgn.trim()) return null;
    const tree = parseCourseTree(pgn);
    const result = /\[Result\s+"([^"]*)"\]/.exec(pgn)?.[1] ?? null;
    return { tree, inferred: tree.errors.length ? null : inferLearnerSide(kind, tree, result === '*' ? null : result) };
  }, [pgn, kind]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const learnerSide = side === 'auto' ? null : side;
    create.mutate(
      { pgn, kind, direction, levelBand, learnerSide, coachPersona },
      { onSuccess: (course) => navigate(`/courses/${course.id}/edit`) }
    );
  }

  const autoLabel = parsed?.inferred ? `From the PGN: ${parsed.inferred === 'white' ? 'White' : 'Black'}` : 'From the PGN (ask me if unclear)';

  return (
    <div className="course-intake">
      <p className="meta">
        <Link to="/courses">← Your courses</Link>
      </p>
      <h1>Create a course</h1>
      <form className="course-intake__form" onSubmit={submit}>
        <label className="course-field">
          <span>PGN</span>
          <textarea rows={8} value={pgn} onChange={(event) => setPgn(event.target.value)} placeholder="1. d4 e5 2. dxe5 Nc6 …" spellCheck={false} />
        </label>
        {parsed && parsed.tree.errors.length > 0 && (
          <ul className="course-intake__errors" role="alert">
            {parsed.tree.errors.slice(0, 3).map((error) => (
              <li key={`${error.pgnLine}-${error.message}`}>{error.message}</li>
            ))}
          </ul>
        )}
        {parsed && !parsed.tree.errors.length && (
          <p className="meta">
            {parsed.tree.nodes.length} moves, {parsed.tree.lines.length} {parsed.tree.lines.length === 1 ? 'line' : 'lines'}
          </p>
        )}
        <label className="course-field">
          <span>Kind</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as CourseKind)}>
            {COURSE_KINDS.map((option) => (
              <option key={option} value={option}>
                {COURSE_KIND_INFO[option].label}
              </option>
            ))}
          </select>
        </label>
        <label className="course-field">
          <span>Direction</span>
          <textarea rows={2} maxLength={500} value={direction} onChange={(event) => setDirection(event.target.value)} placeholder={COURSE_KIND_INFO[kind].example} />
        </label>
        <div className="course-intake__row">
          <label className="course-field">
            <span>Level</span>
            <select value={levelBand} onChange={(event) => setLevelBand(event.target.value as RatingBand)}>
              {RATING_BANDS.map((band) => (
                <option key={band} value={band}>
                  {BAND_LABELS[band]}
                </option>
              ))}
            </select>
          </label>
          <label className="course-field">
            <span>Learner side</span>
            <select value={side} onChange={(event) => setSide(event.target.value as SideChoice)}>
              <option value="auto">{autoLabel}</option>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>
          <label className="course-field">
            <span>Coach</span>
            <select value={coachPersona} onChange={(event) => setPersona(event.target.value as CoachPersona)}>
              {COACH_PERSONAS.map((option) => (
                <option key={option} value={option}>
                  {personaLabel(option)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {create.isError && (
          <p className="course-intake__errors" role="alert">
            {describeApiError(create.error) ?? 'Could not create the course.'}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={!pgn.trim() || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create draft'}
        </button>
      </form>
    </div>
  );
}
