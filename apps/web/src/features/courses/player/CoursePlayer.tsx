import { nextCourseStage, type CourseStage } from '@freechesscoach/chess-analysis';
import { isReadAlong, type CourseDocument, type CourseEnrollmentPlace, type PublicCourseResponse } from '@freechesscoach/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OverflowMenuItem } from '../../../components/OverflowMenu.js';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog.js';
import { useIsDesktop } from '../../../hooks/useIsDesktop.js';
import { CourseDrill } from './CourseDrill.js';
import { placeLabel } from './drill-line.js';
import { CourseHeader } from './CourseHeader.js';
import type { CourseProgressStore } from './course-progress.js';
import type { CourseEvals } from './course-move-list.js';
import { PlayThrough, type AskCoach } from './PlayThrough.js';
import { READING_EPISODE, ReadingView } from './ReadingView.js';
import { SeriesNav } from './SeriesNav.js';
import { useCourseEnrollment } from './useCourseEnrollment.js';
import { useProfileCoachVoice } from '../../../hooks/useProfileCoachVoice.js';
import { useNoteAudio, type NoteAudioSource } from './useNoteAudio.js';
import '../CourseEditor.css';
import './CoursePlayer.css';

export interface CoursePlayerProps {
  /** The published copy on /learn, or the editor's draft in the preview. */
  document: CourseDocument;
  noteAudio: NoteAudioSource;
  /** Above the course, e.g. the editor's "this is a preview" line. */
  notice?: ReactNode;
  /** Where drill results go (§11); absent in the preview, which saves nothing. */
  progress?: CourseProgressStore | null;
  courseSlug?: string;
  /** The stage to open at (`?stage=`); the Due today link opens the drill.
   * Without it, a learner coming back opens where they left off. */
  startStage?: CourseStage;
  /** Each move's evaluation (the eval bar, the graph); `{}` shows neither. */
  evals?: CourseEvals;
  /** The header's back button: to Courses in the app, the site on /learn. */
  back?: { label: string; onBack: () => void };
  /** Inside the signed-in app: the header's menu is the account menu. */
  inApp?: boolean;
  /** The lessons before and after this one in its series (the published page). */
  seriesNeighbours?: PublicCourseResponse['seriesNeighbours'];
}

const NO_EVALS: CourseEvals = {};

const START: CourseEnrollmentPlace = { episode: 0, step: 0, practice: {}, run: null, where: null };

/** docs/courses.md §9, §11: play through (the clip when linked, then each
 * episode on the board, move by move with the coach's notes, arrows and
 * voice) or drill the moves. A quiz waits for the learner's move; a
 * different move is rated in the browser with no AI. Takes a document, not a
 * slug, so the editor previews the draft. */
export function CoursePlayer({ document, noteAudio, notice, progress, courseSlug, startStage, evals = NO_EVALS, back, inApp = false, seriesNeighbours }: CoursePlayerProps): ReactNode {
  const isDesktop = useIsDesktop();
  const [stage, setStage] = useState<CourseStage>(startStage ?? 'play_through');
  const [done, setDone] = useState<ReadonlySet<CourseStage>>(new Set());
  const [place, setPlace] = useState<CourseEnrollmentPlace>(START);
  /** Remounts the stage's view when a saved place or "Start over" replaces it. */
  const [viewKey, setViewKey] = useState(0);
  const voice = useProfileCoachVoice(document.coachPersona);
  const audio = useNoteAudio(noteAudio, {
    voice,
    textOf: (episodeId, nodeId) => {
      if (episodeId === READING_EPISODE) return document.sections?.find((section) => section.id === nodeId)?.text ?? null;
      const ply = document.episodes.find((episode) => episode.id === episodeId)?.plies.find((each) => each.nodeId === nodeId);
      return ply?.course && ply.text.trim() ? ply.text : null;
    }
  });
  const { confirm, dialog } = useConfirmDialog();
  const enrollment = useCourseEnrollment(courseSlug, progress);
  /** The learner has done something here, so there is a place worth saving. */
  const touchedRef = useRef(false);
  const appliedRef = useRef(false);

  // §11: coming back picks up where they left off (a stage asked for in the
  // link still opens, with what they finished before).
  useEffect(() => {
    if (appliedRef.current || enrollment.saved === undefined) return;
    appliedRef.current = true;
    const saved = enrollment.saved;
    if (!saved || touchedRef.current) return;
    setDone(new Set(saved.stagesDone));
    setPlace(saved.place);
    if (!startStage) setStage(saved.stage);
    setViewKey((key) => key + 1);
  }, [enrollment.saved, startStage]);

  useEffect(() => {
    if (touchedRef.current) enrollment.save({ stage, place, stagesDone: [...done] });
  }, [stage, done, place]);

  const touch = (): void => {
    touchedRef.current = true;
  };
  const open = (next: CourseStage): void => {
    touch();
    audio.stop();
    setPlace((prev) => (prev.run ? { ...prev, run: null } : prev));
    setStage(next);
  };
  const finish = (finished: CourseStage): void => {
    touch();
    setDone((prev) => new Set(prev).add(finished));
  };
  const openNext = (): void => {
    const next = nextCourseStage(stage);
    if (next) open(next);
  };
  const startOver = (): void => {
    touch();
    audio.stop();
    setStage('play_through');
    setDone(new Set());
    setPlace(START);
    setViewKey((key) => key + 1);
  };

  // Only for a learner (the editor's preview has no progress), once there is something to lose.
  const menuItems: OverflowMenuItem[] =
    progress && (done.size > 0 || stage !== 'play_through' || place.episode > 0 || place.step > 0)
      ? [
          {
            label: 'Start over',
            destructive: true,
            onSelect: () =>
              confirm(
                { title: 'Start this course over?', description: 'You go back to the first move of Play through, with no stages done. Moves you drilled stay in your reviews.', confirmLabel: 'Start over' },
                startOver
              )
          }
        ]
      : [];

  return (
    <article className="course-player">
      <CourseHeader
        title={document.title || 'Untitled course'}
        stage={stage}
        done={done}
        onStage={open}
        back={back}
        menuItems={menuItems}
        inApp={inApp}
        isDesktop={isDesktop}
        showStages={!isReadAlong(document)}
      />
      {document.series && <SeriesNav series={document.series} neighbours={seriesNeighbours} />}
      {notice}
      {dialog}
      {document.kind === 'reading' ? (
        <ReadingView
          key={viewKey}
          document={document}
          audio={audio}
          isDesktop={isDesktop}
          start={place.step}
          onPage={(page) => {
            touch();
            setPlace((prev) => (prev.step === page ? prev : { ...prev, episode: 0, step: page, where: `Page ${page + 1}` }));
          }}
          onFinished={() => finish('play_through')}
        />
      ) : stage === 'play_through' ? (
        <PlayThrough
          key={viewKey}
          document={document}
          evals={evals}
          audio={audio}
          ask={askFor(progress, courseSlug)}
          isDesktop={isDesktop}
          start={place}
          onPlace={(episode, step) => {
            touch();
            setPlace((prev) =>
              prev.episode === episode && prev.step === step ? prev : { ...prev, episode, step, where: placeLabel(document, document.episodes[episode]?.id, step) ?? prev.where }
            );
          }}
          onFinished={() => {
            finish('play_through');
            if (!isReadAlong(document)) openNext();
          }}
        />
      ) : (
        <div className="course-player__stage">
          <CourseDrill
            key={`${stage}:${viewKey}`}
            document={document}
            evals={evals}
            stage={stage}
            progress={progress}
            courseSlug={courseSlug}
            knownMoves={place.practice}
            onKnownMoves={(practice) => {
              touch();
              setPlace((prev) => ({ ...prev, practice }));
            }}
            startRun={place.run}
            onRun={(run) => {
              // Before the saved place has loaded, the run's first report must not stand in for it.
              if (!appliedRef.current) return;
              touch();
              setPlace((prev) => {
                const where = run ? placeLabel(document, run.episode, run.step) : prev.where;
                return prev.run?.episode === run?.episode && prev.run?.step === run?.step ? prev : { ...prev, run, where };
              });
            }}
            onStageDone={finish}
            onNextStage={openNext}
            onExit={() => open('play_through')}
            isDesktop={isDesktop}
          />
        </div>
      )}
    </article>
  );
}

function askFor(progress: CourseProgressStore | null | undefined, slug: string | undefined): AskCoach {
  if (!progress || !slug) return null;
  return progress.signedIn ? { slug } : 'sign-in';
}
