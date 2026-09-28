import { inferLearnerSide, parseCourseTree } from '@freechesscoach/chess-analysis';
import { bandForRating, COURSE_KINDS, defaultCourseVersions, type CoachPersona, type CourseKind, type CourseVersions } from '@freechesscoach/shared';
import { useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { describeApiError } from '../../api/client.js';
import { ArrowLeftIcon, BookIcon, FlagIcon, type IconProps, KnightIcon, LightbulbIcon, SearchIcon } from '../../components/Icon.js';
import { useProfile } from '../../hooks/useProfile.js';
import { MiniBoard } from '../board/MiniBoard.js';
import { BAND_LABELS } from '../settings/BandSelect.js';
import { CoachPersonaSelect } from '../settings/CoachPersonaSelect.js';
import { useCreateCourse } from './courseApi.js';
import { COURSE_KIND_INFO } from './courseKinds.js';
import { CourseVersionsPicker } from './CourseVersionsPicker.js';
import '../session/SessionPage.css';
import './CourseEditor.css';
import './CourseIntakePage.css';

type SideChoice = 'auto' | 'white' | 'black';

/** The ratings a course can aim at (Phase 90's curriculum levels). */
const RATINGS = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200];

const KIND_ICONS: Record<CourseKind, ComponentType<IconProps>> = {
  trap: FlagIcon,
  opening: BookIcon,
  tactics: LightbulbIcon,
  puzzle: SearchIcon,
  master_game: KnightIcon
};

/** docs/courses.md §5.3: only what the AI can't infer, in four steps: the
 * moves (with the line's end position), the kind, what to teach, and who it
 * is for. The learner side is pre-filled by the same inference the server
 * runs. */
export function CourseIntakePage(): ReactNode {
  const navigate = useNavigate();
  const profile = useProfile();
  const create = useCreateCourse();
  const [pgn, setPgn] = useState('');
  const [kind, setKind] = useState<CourseKind>('trap');
  const [direction, setDirection] = useState('');
  const [rating, setRating] = useState(1200);
  const [chosenVersions, setVersions] = useState<CourseVersions | null>(null);
  const versions = chosenVersions ?? defaultCourseVersions(kind);
  const [side, setSide] = useState<SideChoice>('auto');
  const [persona, setPersona] = useState<CoachPersona | null>(null);
  const coachPersona = persona ?? profile.data?.coachPersona ?? 'general';

  const parsed = useMemo(() => {
    if (!pgn.trim()) return null;
    const tree = parseCourseTree(pgn);
    const result = /\[Result\s+"([^"]*)"\]/.exec(pgn)?.[1] ?? null;
    const leaf = tree.nodes.find((node) => node.id === tree.lines[0]?.leafNodeId);
    return { tree, endFen: leaf?.fenAfter ?? tree.startFen, inferred: tree.errors.length ? null : inferLearnerSide(kind, tree, result === '*' ? null : result) };
  }, [pgn, kind]);
  const valid = parsed !== null && parsed.tree.errors.length === 0 && parsed.tree.nodes.length > 0;
  const teaches = side === 'auto' ? parsed?.inferred : side;

  function submit(event: FormEvent): void {
    event.preventDefault();
    const learnerSide = side === 'auto' ? null : side;
    create.mutate({ pgn, kind, direction, levelBand: bandForRating(rating), rating, learnerSide, coachPersona, versions }, { onSuccess: (course) => navigate(`/studio/${course.id}/edit`) });
  }

  return (
    <div className="page course-new">
      <Link to="/studio" className="course-new__back">
        <ArrowLeftIcon width={16} height={16} />
        Course studio
      </Link>
      <h1>New course</h1>
      <p className="course-new__lead">Paste the moves, say what to teach, and the AI writes the course for you to edit.</p>
      <form className="course-new__form" onSubmit={submit}>
        <section className="card course-new__step" aria-labelledby="course-new-moves">
          <h2 id="course-new-moves">
            <span className="course-new__number">1</span> The moves
          </h2>
          <div className="course-new__moves">
            <label className="course-field course-new__pgn">
              <span className="visually-hidden">PGN</span>
              <textarea rows={9} value={pgn} onChange={(event) => setPgn(event.target.value)} placeholder="Paste a PGN: 1. d4 e5 2. dxe5 Nc6 …" spellCheck={false} aria-label="PGN" />
            </label>
            <div className="course-new__preview">
              {valid ? (
                <>
                  <span data-testid="course-intake-board">
                    <MiniBoard fen={parsed.endFen} size={168} />
                  </span>
                  <p className="course-new__facts">
                    {`${parsed.tree.nodes.length} moves, ${parsed.tree.lines.length} ${parsed.tree.lines.length === 1 ? 'line' : 'lines'}${teaches ? `, you teach ${teaches === 'white' ? 'White' : 'Black'}` : ''}`}
                  </p>
                </>
              ) : (
                <div className="course-new__placeholder">The line’s end position shows here.</div>
              )}
              {parsed && parsed.tree.errors.length > 0 && (
                <ul className="course-intake__errors" role="alert">
                  {parsed.tree.errors.slice(0, 3).map((error) => (
                    <li key={`${error.pgnLine}-${error.message}`}>{error.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="card course-new__step" aria-labelledby="course-new-kind">
          <h2 id="course-new-kind">
            <span className="course-new__number">2</span> What kind of course?
          </h2>
          <div className="course-new__kinds" role="radiogroup" aria-labelledby="course-new-kind">
            {COURSE_KINDS.map((option) => {
              const Icon = KIND_ICONS[option];
              return (
                <label key={option} className={kind === option ? 'course-new__kind selected' : 'course-new__kind'}>
                  <input type="radio" name="course-kind" checked={kind === option} onChange={() => setKind(option)} aria-label={`${COURSE_KIND_INFO[option].label}: ${COURSE_KIND_INFO[option].summary}`} />
                  <span className="course-new__kind-icon" aria-hidden="true">
                    <Icon width={20} height={20} />
                  </span>
                  <strong>{COURSE_KIND_INFO[option].label}</strong>
                  <span className="course-new__kind-summary">{COURSE_KIND_INFO[option].summary}</span>
                </label>
              );
            })}
          </div>
          <CourseVersionsPicker value={versions} onChange={setVersions} />
        </section>

        <section className="card course-new__step" aria-labelledby="course-new-direction">
          <h2 id="course-new-direction">
            <span className="course-new__number">3</span> What to teach
          </h2>
          <textarea
            className="course-new__direction"
            rows={3}
            maxLength={500}
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            placeholder={COURSE_KIND_INFO[kind].example}
            aria-label="What to teach"
          />
          <div className="course-new__example">
            <span className="meta">For example: {COURSE_KIND_INFO[kind].example}</span>
            <button type="button" className="course-new__chip" onClick={() => setDirection(COURSE_KIND_INFO[kind].example)}>
              Use this example
            </button>
          </div>
        </section>

        <section className="card course-new__step" aria-labelledby="course-new-who">
          <h2 id="course-new-who">
            <span className="course-new__number">4</span> Who it is for
          </h2>
          <div className="course-new__field">
            <span className="course-new__label">The learner’s rating</span>
            <div className="course-new__sides" role="group" aria-label="The learner’s rating">
              {RATINGS.map((option) => (
                <button key={option} type="button" className="course-new__side" aria-pressed={rating === option} onClick={() => setRating(option)}>
                  {option}
                </button>
              ))}
            </div>
            <span className="meta">
              Written for: {BAND_LABELS[bandForRating(rating)]}. The course takes the next place in your {rating} curriculum.
            </span>
          </div>
          <div className="course-new__field">
            <span className="course-new__label">The learner plays</span>
            <div className="course-new__sides" role="group" aria-label="The learner plays">
              {(['auto', 'white', 'black'] as const).map((option) => (
                <button key={option} type="button" className="course-new__side" aria-pressed={side === option} onClick={() => setSide(option)}>
                  {option === 'auto' ? (parsed?.inferred ? `From the PGN (${parsed.inferred === 'white' ? 'White' : 'Black'})` : 'From the PGN') : option === 'white' ? 'White' : 'Black'}
                </button>
              ))}
            </div>
          </div>
          <div className="course-new__field">
            <span className="course-new__label">The course coach</span>
            <CoachPersonaSelect value={coachPersona} onChange={setPersona} />
          </div>
        </section>

        {create.isError && (
          <p className="course-intake__errors" role="alert">
            {describeApiError(create.error) ?? 'Could not create the course.'}
          </p>
        )}
        <div className="course-new__submit">
          <button type="submit" className="btn-primary" disabled={!valid || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
