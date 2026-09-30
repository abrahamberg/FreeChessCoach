import { courseVideos, type CourseDocument, type CourseResponse } from '@freechesscoach/shared';
import { useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { describeApiError } from '../../api/client.js';
import type { BoardArrow } from '../board/CoachBoard.js';
import { isGenerating, useBuildCourseSkeleton, useCourse, useSaveCourseDraft, useStartCourseGeneration } from './courseApi.js';
import { CourseDetails } from './CourseDetails.js';
import { episodeNodeIds, updateEpisode } from './courseEdits.js';
import { CourseBoardPanel } from './CourseBoardPanel.js';
import { CourseEpisodeAi } from './CourseEpisodeAi.js';
import { CourseEpisodePanel } from './CourseEpisodePanel.js';
import { CourseProducts } from './CourseProducts.js';
import { CourseGenerationBar } from './CourseGenerationBar.js';
import { CourseStudioHeader } from './CourseStudioHeader.js';
import { CourseOutline } from './CourseOutline.js';
import { ClipPreview, previewableProducts } from './clip/ClipPreview.js';
import { PublishDialog } from './PublishDialog.js';
import { StartOverDialog } from './StartOverDialog.js';
import { LearnerPreview } from './player/LearnerPreview.js';
import './CourseEditor.css';

type Section = 'episodes' | 'course' | 'videos';

export function CourseEditorPage(): ReactNode {
  const { id = '' } = useParams<{ id: string }>();
  const course = useCourse(id);
  if (course.isPending) return <p className="course-editor__status">Loading…</p>;
  if (course.isError) return <p className="course-editor__status">{describeApiError(course.error) ?? 'Could not load the course.'}</p>;
  return <CourseEditor key={course.data.id} course={course.data} />;
}

function CourseEditor({ course }: { course: CourseResponse }): ReactNode {
  const save = useSaveCourseDraft(course.id);
  const build = useBuildCourseSkeleton(course.id);
  const [document, setDocument] = useState<CourseDocument>(course.document);
  const [dirty, setDirty] = useState(false);
  const [startingOver, setStartingOver] = useState(false);
  const start = useStartCourseGeneration(course.id);
  const [episodeId, setEpisodeId] = useState<string | null>(course.document.episodes[0]?.id ?? null);
  const [nodeId, setNodeId] = useState<string | null>(course.document.episodes[0]?.startNodeId ?? null);
  const [drawnArrows, setDrawnArrows] = useState<BoardArrow[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [learnerPreview, setLearnerPreview] = useState(false);
  const [section, setSection] = useState<Section>('episodes');
  const [seen, setSeen] = useState(course.updatedAt);
  const latest = useRef(document);
  latest.current = document;
  // The AI writes the draft on the server; the editor follows it and waits.
  const writing = isGenerating(course);

  // The server's copy changed (an episode written, a rebuilt skeleton, a
  // refetch): take it, unless the creator has edits it would throw away.
  // The chosen episode and section stay.
  if (course.updatedAt !== seen) {
    setSeen(course.updatedAt);
    if (!dirty) {
      setDocument(course.document);
      if (!course.document.episodes.some((candidate) => candidate.id === episodeId)) {
        setEpisodeId(course.document.episodes[0]?.id ?? null);
        setNodeId(course.document.episodes[0]?.startNodeId ?? null);
      }
    }
  }

  const episode = document.episodes.find((candidate) => candidate.id === episodeId);
  const nodeIds = episode ? episodeNodeIds(document, episode) : document.nodes.map((node) => node.id);
  const noteArrows = episode?.plies.find((ply) => ply.nodeId === nodeId)?.arrows ?? [];

  function edit(next: CourseDocument): void {
    if (writing) return;
    setDocument(next);
    setDirty(true);
  }

  function selectEpisode(nextId: string): void {
    setEpisodeId(nextId);
    setNodeId(document.episodes.find((candidate) => candidate.id === nextId)?.startNodeId ?? null);
  }

  /** Unsaved edits are saved first: the server builds from its own copy. */
  function runBuild(): void {
    setStartingOver(false);
    if (!dirty) return build.mutate();
    save.mutate(document, {
      onSuccess: () => {
        setDirty(false);
        build.mutate();
      }
    });
  }

  const error = save.error ?? build.error ?? start.error;
  const videos = courseVideos(document);
  const sections: [Section, string][] = [
    ['episodes', document.episodes.length ? `Episodes · ${document.episodes.length}` : 'Episodes'],
    ['course', 'Course'],
    ...(videos.video || videos.reel ? [['videos', 'Videos'] as [Section, string]] : [])
  ];
  const shown = sections.some(([value]) => value === section) ? section : 'episodes';
  const episodeIndex = episode ? document.episodes.indexOf(episode) : -1;
  return (
    <div className="course-editor">
      <CourseStudioHeader
        title={document.title}
        onTitle={(title) => edit({ ...document, title })}
        status={course.status}
        dirty={dirty}
        saving={save.isPending}
        onSave={() =>
          save.mutate(document, {
            // Edits made while it saved are still unsaved.
            onSuccess: () => setDirty(latest.current !== document)
          })
        }
        onPreviewClip={previewableProducts(document).length ? () => setPreviewing(true) : undefined}
        onPreviewLearner={document.episodes.length ? () => setLearnerPreview(true) : undefined}
        onPublish={document.episodes.length ? () => setPublishing(true) : undefined}
        published={course.publishedAt !== null}
        more={[{ label: build.isPending || start.isPending ? 'Starting over…' : 'Start over…', disabled: writing || build.isPending || start.isPending, onSelect: () => setStartingOver(true) }]}
      />
      {error && (
        <p className="course-intake__errors" role="alert">
          {describeApiError(error) ?? 'Something went wrong.'}
        </p>
      )}
      <CourseGenerationBar course={course} dirty={dirty} />
      <div className="studio-sections" role="tablist" aria-label="Studio">
        {sections.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`studio-tab-${value}`}
            aria-selected={shown === value}
            aria-controls={`studio-section-${value}`}
            className="studio-sections__tab"
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {shown === 'episodes' && (
        <div className="course-editor__workspace" role="tabpanel" id="studio-section-episodes" aria-labelledby="studio-tab-episodes">
          <CourseOutline document={document} selectedEpisodeId={episodeId} onSelectEpisode={selectEpisode} />
          <div className="course-editor__stage">
            <CourseBoardPanel
              document={document}
              nodeIds={nodeIds}
              selectedNodeId={nodeId}
              onSelectNode={setNodeId}
              arrows={noteArrows}
              plies={episode?.plies ?? []}
              onDrawnArrows={setDrawnArrows}
            />
          </div>
          {episode ? (
            <fieldset className="course-editor__fields" disabled={writing}>
            <CourseEpisodePanel
              document={document}
              episode={episode}
              position={{ index: episodeIndex, count: document.episodes.length }}
              onStepEpisode={(offset) => {
                const next = document.episodes[episodeIndex + offset];
                if (next) selectEpisode(next.id);
              }}
              direction={course.direction}
              nodeIds={nodeIds}
              selectedNodeId={nodeId}
              drawnArrows={drawnArrows}
              onChange={(next) => edit(updateEpisode(document, next.id, () => next))}
              aiWriter={<CourseEpisodeAi courseId={course.id} episodeId={episode.id} generation={course.generation} dirty={dirty} />}
            />
            </fieldset>
          ) : (
            <div className="course-panel course-editor__empty meta">
              {document.episodes.length ? 'Pick an episode from the list.' : 'No episodes yet. Write the course with AI, or start over from the ⋮ menu to build it from your PGN without AI.'}
            </div>
          )}
        </div>
      )}
      {shown === 'course' && (
        <div className="course-editor__sheet" role="tabpanel" id="studio-section-course" aria-labelledby="studio-tab-course">
          <fieldset className="course-editor__fields" disabled={writing}>
            <CourseDetails document={document} onChange={edit} />
          </fieldset>
        </div>
      )}
      {shown === 'videos' && (
        <div className="course-editor__sheet course-editor__sheet--two" role="tabpanel" id="studio-section-videos" aria-labelledby="studio-tab-videos">
          <fieldset className="course-editor__fields" disabled={writing}>
            <CourseProducts courseId={course.id} document={document} generation={course.generation} dirty={dirty} onChange={edit} />
          </fieldset>
        </div>
      )}
      {publishing && (
        <PublishDialog
          course={course}
          document={document}
          onDocumentChange={(next) => {
            setDocument(next);
            setDirty(false);
          }}
          onPublished={() => setPublishing(false)}
          onClose={() => setPublishing(false)}
        />
      )}
      {learnerPreview && <LearnerPreview document={document} onClose={() => setLearnerPreview(false)} />}
      {previewing && <ClipPreview document={document} slug={course.slug} evals={course.evals} onClose={() => setPreviewing(false)} />}
      {startingOver && (
        <StartOverDialog
          dirty={dirty}
          onClose={() => setStartingOver(false)}
          onTemplate={runBuild}
          onWithAi={() => {
            setStartingOver(false);
            if (!dirty) return start.mutate({ restart: true });
            save.mutate(document, {
              onSuccess: () => {
                setDirty(false);
                start.mutate({ restart: true });
              }
            });
          }}
        />
      )}
    </div>
  );
}
