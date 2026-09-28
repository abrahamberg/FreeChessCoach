import type { CourseDocument, CourseResponse } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { describeApiError } from '../../api/client.js';
import type { BoardArrow } from '../board/CoachBoard.js';
import { useBuildCourseSkeleton, useCourse, useSaveCourseDraft, useStartCourseGeneration } from './courseApi.js';
import { CourseDetails } from './CourseDetails.js';
import { episodeNodeIds, updateEpisode } from './courseEdits.js';
import { CourseBoardPanel } from './CourseBoardPanel.js';
import { CourseEpisodeAi } from './CourseEpisodeAi.js';
import { CourseEpisodePanel } from './CourseEpisodePanel.js';
import { CourseGenerationBar } from './CourseGenerationBar.js';
import { CourseStudioHeader } from './CourseStudioHeader.js';
import { CourseOutline } from './CourseOutline.js';
import { ClipPreview, previewableProducts } from './clip/ClipPreview.js';
import { PublishDialog } from './PublishDialog.js';
import { StartOverDialog } from './StartOverDialog.js';
import { LearnerPreview } from './player/LearnerPreview.js';
import './CourseEditor.css';

export function CourseEditorPage(): ReactNode {
  const { id = '' } = useParams<{ id: string }>();
  const course = useCourse(id);
  if (course.isPending) return <p className="course-editor__status">Loading…</p>;
  if (course.isError) return <p className="course-editor__status">{describeApiError(course.error) ?? 'Could not load the course.'}</p>;
  // Remounts with a fresh draft whenever the server's copy is replaced (a rebuilt skeleton).
  return <CourseEditor key={course.data.updatedAt} course={course.data} />;
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

  const episode = document.episodes.find((candidate) => candidate.id === episodeId);
  const nodeIds = episode ? episodeNodeIds(document, episode) : document.nodes.map((node) => node.id);
  const noteArrows = episode?.plies.find((ply) => ply.nodeId === nodeId)?.arrows ?? [];

  function edit(next: CourseDocument): void {
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
  return (
    <div className="course-editor">
      <CourseStudioHeader
        title={document.title}
        onTitle={(title) => edit({ ...document, title })}
        status={course.status}
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate(document, { onSuccess: () => setDirty(false) })}
        onPreviewClip={previewableProducts(document).length ? () => setPreviewing(true) : undefined}
        onPreviewLearner={document.episodes.length ? () => setLearnerPreview(true) : undefined}
        onPublish={document.episodes.length ? () => setPublishing(true) : undefined}
        published={course.publishedAt !== null}
        more={[{ label: build.isPending || start.isPending ? 'Starting over…' : 'Start over…', disabled: build.isPending || start.isPending, onSelect: () => setStartingOver(true) }]}
      />
      {error && (
        <p className="course-intake__errors" role="alert">
          {describeApiError(error) ?? 'Something went wrong.'}
        </p>
      )}
      <div className="course-editor__columns">
        <aside className="course-editor__side">
          <CourseDetails document={document} onChange={edit}>
            <CourseGenerationBar course={course} dirty={dirty} />
          </CourseDetails>
          <CourseOutline document={document} selectedEpisodeId={episodeId} onSelectEpisode={selectEpisode} />
        </aside>
        <CourseBoardPanel
          document={document}
          nodeIds={nodeIds}
          selectedNodeId={nodeId}
          onSelectNode={setNodeId}
          arrows={noteArrows}
          plies={episode?.plies ?? []}
          onDrawnArrows={setDrawnArrows}
        />
        {episode ? (
          <CourseEpisodePanel
            document={document}
            episode={episode}
            direction={course.direction}
            nodeIds={nodeIds}
            selectedNodeId={nodeId}
            drawnArrows={drawnArrows}
            onChange={(next) => edit(updateEpisode(document, next.id, () => next))}
            aiWriter={<CourseEpisodeAi courseId={course.id} episodeId={episode.id} generation={course.generation} dirty={dirty} />}
          />
        ) : (
          <div className="course-panel meta">Pick an episode on the left.</div>
        )}
      </div>
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
