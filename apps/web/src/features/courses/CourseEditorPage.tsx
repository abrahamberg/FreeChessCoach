import type { CourseDocument, CourseResponse } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { describeApiError } from '../../api/client.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import type { BoardArrow } from '../board/CoachBoard.js';
import { useBuildCourseSkeleton, useCourse, useSaveCourseDraft } from './courseApi.js';
import { episodeNodeIds, updateEpisode } from './courseEdits.js';
import { CourseBoardPanel } from './CourseBoardPanel.js';
import { CourseEpisodeAi } from './CourseEpisodeAi.js';
import { CourseEpisodePanel } from './CourseEpisodePanel.js';
import { CourseGenerationBar } from './CourseGenerationBar.js';
import { CourseOutline } from './CourseOutline.js';
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
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [episodeId, setEpisodeId] = useState<string | null>(course.document.episodes[0]?.id ?? null);
  const [nodeId, setNodeId] = useState<string | null>(course.document.episodes[0]?.startNodeId ?? null);
  const [drawnArrows, setDrawnArrows] = useState<BoardArrow[]>([]);

  const episode = document.episodes.find((candidate) => candidate.id === episodeId);
  const nodeIds = episode ? episodeNodeIds(document, episode) : document.nodes.map((node) => node.id);
  const noteArrows = episode?.notes.find((note) => note.nodeId === nodeId)?.arrows ?? [];

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
    setConfirmRebuild(false);
    if (!dirty) return build.mutate();
    save.mutate(document, {
      onSuccess: () => {
        setDirty(false);
        build.mutate();
      }
    });
  }

  const error = save.error ?? build.error;
  return (
    <div className="course-editor">
      <header className="course-editor__header">
        <label className="course-field course-field--grow">
          <span>Title</span>
          <input value={document.title} maxLength={120} onChange={(event) => edit({ ...document, title: event.target.value })} />
        </label>
        <label className="course-field course-field--grow">
          <span>Promise</span>
          <input value={document.promise} placeholder="After this you can …" onChange={(event) => edit({ ...document, promise: event.target.value })} />
        </label>
        <div className="course-editor__actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={build.isPending}
            onClick={() => (document.episodes.length ? setConfirmRebuild(true) : runBuild())}
          >
            {build.isPending ? 'Building…' : 'Build without AI'}
          </button>
          <button type="button" className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(document, { onSuccess: () => setDirty(false) })}>
            {save.isPending ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
          </button>
        </div>
      </header>
      <CourseGenerationBar course={course} dirty={dirty} />
      {error && (
        <p className="course-intake__errors" role="alert">
          {describeApiError(error) ?? 'Something went wrong.'}
        </p>
      )}
      <div className="course-editor__columns">
        <CourseOutline document={document} selectedEpisodeId={episodeId} onSelectEpisode={selectEpisode} />
        <CourseBoardPanel
          document={document}
          nodeIds={nodeIds}
          selectedNodeId={nodeId}
          onSelectNode={setNodeId}
          arrows={noteArrows}
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
      {confirmRebuild && (
        <ConfirmDialog
          title="Rebuild without AI?"
          description="This replaces every chapter and episode with fresh template text. Your title and promise stay."
          confirmLabel="Rebuild"
          onConfirm={runBuild}
          onCancel={() => setConfirmRebuild(false)}
        />
      )}
    </div>
  );
}
