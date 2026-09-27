import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { addBeat, moveLabel, removeBeat, updateBeat } from './courseEdits.js';

export interface CourseBeatsEditorProps {
  document: CourseDocument;
  episode: CourseEpisode;
  nodeIds: string[];
  selectedNodeId: string | null;
  onChange: (episode: CourseEpisode) => void;
}

/** The clip's beats: what the coach says, the caption, and the move it sits on. */
export function CourseBeatsEditor({ document, episode, nodeIds, selectedNodeId, onChange }: CourseBeatsEditorProps): ReactNode {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  return (
    <section className="course-panel__section">
      <h3>Clip beats</h3>
      {episode.beats.length === 0 && <p className="meta">No narration yet. {episode.focus}</p>}
      <ol className="course-beats">
        {episode.beats.map((beat, index) => (
          <li key={index} className="course-beat">
            <label className="course-field">
              <span>Move</span>
              <select value={beat.nodeId ?? ''} onChange={(event) => onChange(updateBeat(episode, index, { nodeId: event.target.value || null }))}>
                <option value="">Title card</option>
                {nodeIds.map((nodeId) => {
                  const node = byId.get(nodeId);
                  return node ? (
                    <option key={nodeId} value={nodeId}>
                      {moveLabel(document, node)}
                    </option>
                  ) : null;
                })}
              </select>
            </label>
            <label className="course-field">
              <span>Say</span>
              <textarea rows={2} value={beat.say} onChange={(event) => onChange(updateBeat(episode, index, { say: event.target.value }))} />
            </label>
            <label className="course-field">
              <span>Caption</span>
              <input value={beat.caption} onChange={(event) => onChange(updateBeat(episode, index, { caption: event.target.value }))} />
            </label>
            <label className="course-field course-field--narrow">
              <span>Pause (ms)</span>
              <input
                type="number"
                min={0}
                step={500}
                value={beat.pauseMs ?? ''}
                onChange={(event) => onChange(updateBeat(episode, index, { pauseMs: event.target.value ? Math.max(0, Math.round(Number(event.target.value))) : undefined }))}
              />
            </label>
            <button type="button" className="btn-ghost" onClick={() => onChange(removeBeat(episode, index))}>
              Remove beat
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-secondary" onClick={() => onChange(addBeat(episode, selectedNodeId))}>
        Add a beat at this move
      </button>
    </section>
  );
}
