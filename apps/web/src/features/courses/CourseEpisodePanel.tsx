import type { CourseArrow, CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import type { BoardArrow } from '../board/CoachBoard.js';
import { COURSE_ARROW_KINDS, fromDrawnArrows } from './courseArrows.js';
import { moveLabel, setNote, withoutQuiz } from './courseEdits.js';
import { CourseBeatsEditor } from './CourseBeatsEditor.js';
import { CourseEpisodeWarnings } from './CourseEpisodeWarnings.js';

export interface CourseEpisodePanelProps {
  document: CourseDocument;
  episode: CourseEpisode;
  /** The creator's intake direction, for the verifier's percentage rule. */
  direction: string;
  nodeIds: string[];
  selectedNodeId: string | null;
  drawnArrows: BoardArrow[];
  onChange: (episode: CourseEpisode) => void;
  /** The AI writer's warnings and "Regenerate", when the AI wrote the course. */
  aiWriter?: ReactNode;
}

type Tab = 'notes' | 'quiz' | 'clip' | 'ai';

/** Right column: the selected episode's check warnings, then tabs (Phase
 * 89): Notes (the focus, the note on the selected move and its arrows),
 * Quiz, Clip (the beats) and AI (the episode's writer, when the AI wrote the
 * course), instead of one long form. */
export function CourseEpisodePanel({ document, episode, direction, nodeIds, selectedNodeId, drawnArrows, onChange, aiWriter }: CourseEpisodePanelProps): ReactNode {
  const node = selectedNodeId ? document.nodes.find((candidate) => candidate.id === selectedNodeId) : undefined;
  const note = episode.notes.find((candidate) => candidate.nodeId === selectedNodeId);
  const noteArrows = note?.arrows ?? [];
  const answerNode = document.nodes.find((candidate) => candidate.id === episode.quiz?.answerNodeId);
  const setArrows = (arrows: CourseArrow[]): void => {
    if (selectedNodeId) onChange(setNote(episode, selectedNodeId, { arrows }));
  };

  const [tab, setTab] = useState<Tab>('notes');
  const tabs: [Tab, string][] = [
    ['notes', 'Notes'],
    ['quiz', episode.quiz ? 'Quiz ✓' : 'Quiz'],
    ['clip', 'Clip'],
    ...(aiWriter ? [['ai', 'AI'] as [Tab, string]] : [])
  ];

  return (
    <div className="course-panel course-episode-panel">
      <p className="course-panel__role">{episode.role}</p>
      <CourseEpisodeWarnings document={document} episode={episode} direction={direction} />
      <div className="course-tabs" role="tablist" aria-label="Episode">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`course-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`course-tabpanel-${value}`}
            className="course-tabs__tab"
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="course-tabs__panel" role="tabpanel" id={`course-tabpanel-${tab}`} aria-labelledby={`course-tab-${tab}`}>
        {tab === 'notes' && (
          <>
            <label className="course-field">
              <span>Focus</span>
              <input value={episode.focus} onChange={(event) => onChange({ ...episode, focus: event.target.value })} />
            </label>
            {node && selectedNodeId ? (
              <section className="course-panel__section">
                <h3>Note on {moveLabel(document, node)}</h3>
                <textarea rows={5} value={note?.text ?? ''} onChange={(event) => onChange(setNote(episode, selectedNodeId, { text: event.target.value }))} />
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
            ) : (
              <p className="meta">Pick a move under the board to write its note.</p>
            )}
          </>
        )}

        {tab === 'quiz' && (
          <section className="course-panel__section">
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
              <>
                <p className="meta">A quiz stops on a move and asks the learner to find it. Pick the move under the board first.</p>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!selectedNodeId}
                  onClick={() => selectedNodeId && onChange({ ...episode, quiz: { answerNodeId: selectedNodeId, prompt: 'Find the strongest move.', hint: '', reveal: '' } })}
                >
                  Quiz on this move
                </button>
              </>
            )}
          </section>
        )}

        {tab === 'clip' && <CourseBeatsEditor document={document} episode={episode} nodeIds={nodeIds} selectedNodeId={selectedNodeId} onChange={onChange} />}

        {tab === 'ai' && aiWriter}
      </div>
    </div>
  );
}
