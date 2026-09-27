import type { CourseArrow, CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import type { BoardArrow } from '../board/CoachBoard.js';
import { COURSE_ARROW_KINDS, fromDrawnArrows } from './courseArrows.js';
import { moveLabel, setNote, withoutQuiz } from './courseEdits.js';
import { CourseBeatsEditor } from './CourseBeatsEditor.js';

export interface CourseEpisodePanelProps {
  document: CourseDocument;
  episode: CourseEpisode;
  nodeIds: string[];
  selectedNodeId: string | null;
  drawnArrows: BoardArrow[];
  onChange: (episode: CourseEpisode) => void;
}

/** Right column: the selected episode's focus, the note on the selected
 * move (with its arrows), the quiz, and the clip beats. */
export function CourseEpisodePanel({ document, episode, nodeIds, selectedNodeId, drawnArrows, onChange }: CourseEpisodePanelProps): ReactNode {
  const node = selectedNodeId ? document.nodes.find((candidate) => candidate.id === selectedNodeId) : undefined;
  const note = episode.notes.find((candidate) => candidate.nodeId === selectedNodeId);
  const noteArrows = note?.arrows ?? [];
  const answerNode = document.nodes.find((candidate) => candidate.id === episode.quiz?.answerNodeId);
  const setArrows = (arrows: CourseArrow[]): void => {
    if (selectedNodeId) onChange(setNote(episode, selectedNodeId, { arrows }));
  };

  return (
    <div className="course-panel">
      <p className="course-panel__role">{episode.role}</p>
      <label className="course-field">
        <span>Focus</span>
        <input value={episode.focus} onChange={(event) => onChange({ ...episode, focus: event.target.value })} />
      </label>

      {node && selectedNodeId && (
        <section className="course-panel__section">
          <h3>Note on {moveLabel(document, node)}</h3>
          <textarea rows={4} value={note?.text ?? ''} onChange={(event) => onChange(setNote(episode, selectedNodeId, { text: event.target.value }))} />
          <div className="course-arrows">
            {noteArrows.map((arrow, index) => (
              <button
                key={`${arrow.from}${arrow.to}${arrow.kind}`}
                type="button"
                className={`course-chip course-chip--${arrow.kind}`}
                title="Remove this arrow"
                onClick={() => setArrows(noteArrows.filter((_arrow, at) => at !== index))}
              >
                {arrow.from === arrow.to ? arrow.from : `${arrow.from}→${arrow.to}`} · {arrow.kind} ✕
              </button>
            ))}
          </div>
          <div className="course-arrows">
            <span className="meta">{drawnArrows.length ? `Add the ${drawnArrows.length} drawn as:` : 'Tap two squares on the board to draw an arrow.'}</span>
            {drawnArrows.length > 0 &&
              COURSE_ARROW_KINDS.map((kind) => (
                <button key={kind} type="button" className="btn-secondary" onClick={() => setArrows([...noteArrows, ...fromDrawnArrows(drawnArrows, kind)])}>
                  {kind}
                </button>
              ))}
          </div>
        </section>
      )}

      <section className="course-panel__section">
        <h3>Quiz</h3>
        {episode.quiz ? (
          <>
            <p className="meta">Answer: {answerNode ? moveLabel(document, answerNode) : episode.quiz.answerNodeId}</p>
            {(['prompt', 'hint', 'reveal'] as const).map((field) => (
              <label key={field} className="course-field">
                <span>{field}</span>
                <input value={episode.quiz?.[field] ?? ''} onChange={(event) => episode.quiz && onChange({ ...episode, quiz: { ...episode.quiz, [field]: event.target.value } })} />
              </label>
            ))}
            <button type="button" className="btn-ghost" onClick={() => onChange(withoutQuiz(episode))}>
              Remove quiz
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            disabled={!selectedNodeId}
            onClick={() => selectedNodeId && onChange({ ...episode, quiz: { answerNodeId: selectedNodeId, prompt: 'Find the strongest move.', hint: '', reveal: '' } })}
          >
            Quiz on this move
          </button>
        )}
      </section>

      <CourseBeatsEditor document={document} episode={episode} nodeIds={nodeIds} selectedNodeId={selectedNodeId} onChange={onChange} />
    </div>
  );
}
