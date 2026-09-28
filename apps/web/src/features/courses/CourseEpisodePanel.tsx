import { videoCaption, videoLine, type CourseArrow, type CourseDocument, type CourseEpisode, type CoursePly } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import type { BoardArrow } from '../board/CoachBoard.js';
import { COURSE_ARROW_KINDS, fromDrawnArrows } from './courseArrows.js';
import { moveLabel, setPly, withoutQuiz } from './courseEdits.js';
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

type Tab = 'moves' | 'quiz' | 'video' | 'ai';

/** This episode's rough length in the video: spoken words, and the move
 * shown before each line. */
export function videoSecondsOf(episode: CourseEpisode): number {
  const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
  const spoken = episode.plies.filter((ply) => ply.video).reduce((sum, ply) => sum + words(videoLine(ply)), 0);
  return Math.round(spoken / 2.6 + episode.plies.filter((ply) => ply.video).length * 0.7);
}

/** Right column: the selected episode's warnings, what speaks against the
 * plan's budget, and tabs: Moves (the selected move for the course and the
 * YouTube video), Quiz, Video (this episode's part of the video) and AI. */
export function CourseEpisodePanel({ document, episode, direction, nodeIds, selectedNodeId, drawnArrows, onChange, aiWriter }: CourseEpisodePanelProps): ReactNode {
  const [tab, setTab] = useState<Tab>('moves');
  const node = selectedNodeId ? document.nodes.find((candidate) => candidate.id === selectedNodeId) : undefined;
  const ply = episode.plies.find((candidate) => candidate.nodeId === selectedNodeId);
  const answerNode = document.nodes.find((candidate) => candidate.id === episode.quiz?.answerNodeId);
  const change = (patch: Partial<Omit<CoursePly, 'nodeId'>>): void => {
    if (selectedNodeId) onChange(setPly(episode, selectedNodeId, patch, nodeIds));
  };
  const inCourse = episode.plies.filter((each) => each.course).length;
  const inVideo = episode.plies.filter((each) => each.video).length;
  const tabs: [Tab, string][] = [
    ['moves', 'Moves'],
    ['quiz', episode.quiz ? 'Quiz ✓' : 'Quiz'],
    ['video', 'Video'],
    ...(aiWriter ? [['ai', 'AI'] as [Tab, string]] : [])
  ];

  return (
    <div className="course-panel course-episode-panel">
      <p className="course-panel__role">{episode.role}</p>
      {/* A video the plan gave 0 was not planned: added by hand, no budget. */}
      <p className="course-budget meta">
        <span className={episode.budget?.course && inCourse > episode.budget.course ? 'course-budget--over' : undefined}>
          {inCourse}
          {episode.budget?.course ? ` of ${episode.budget.course}` : ''} speak in the course
        </span>
        {' · '}
        <span className={episode.budget?.video && inVideo > episode.budget.video ? 'course-budget--over' : undefined}>
          {inVideo}
          {episode.budget?.video ? ` of ${episode.budget.video}` : ''} in the video
        </span>
      </p>
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
        {tab === 'moves' && (
          <>
            <label className="course-field">
              <span>Focus</span>
              <input value={episode.focus} onChange={(event) => onChange({ ...episode, focus: event.target.value })} />
            </label>
            {node && selectedNodeId ? (
              <section className="course-panel__section" aria-label={`The move ${moveLabel(document, node)}`}>
                <h3>{moveLabel(document, node)}</h3>
                <div className="course-ply__ticks" role="group" aria-label="Where it speaks">
                  <button type="button" className="course-ply__tick" aria-pressed={Boolean(ply?.course)} onClick={() => change({ course: !ply?.course })}>
                    In the course
                  </button>
                  <button type="button" className="course-ply__tick" aria-pressed={Boolean(ply?.video)} onClick={() => change({ video: !ply?.video })}>
                    In the video
                  </button>
                </div>
                <label className="course-field">
                  <span>What the coach says</span>
                  <textarea rows={4} value={ply?.text ?? ''} onChange={(event) => change({ text: event.target.value })} />
                </label>
                {ply?.video && <VideoLineFields ply={ply} onChange={change} />}
                <Arrows arrows={ply?.arrows ?? []} drawnArrows={drawnArrows} onChange={(arrows) => change({ arrows })} />
              </section>
            ) : (
              <p className="meta">Pick a move under the board.</p>
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

        {tab === 'video' && <VideoScript document={document} episode={episode} />}

        {tab === 'ai' && aiWriter}
      </div>
    </div>
  );
}

/** A video move: its own line when it needs one, and the caption. */
function VideoLineFields({ ply, onChange }: { ply: CoursePly; onChange: (patch: Partial<Omit<CoursePly, 'nodeId'>>) => void }): ReactNode {
  const [own, setOwn] = useState(ply.say !== undefined);
  return (
    <div className="course-ply__clip">
      <label className="course-ply__own">
        <input
          type="checkbox"
          checked={own}
          onChange={(event) => {
            setOwn(event.target.checked);
            onChange({ say: event.target.checked ? (ply.say ?? ply.text) : undefined });
          }}
        />
        A different line for the video
      </label>
      {own && (
        <label className="course-field">
          <span>The video says</span>
          <textarea rows={2} value={ply.say ?? ''} onChange={(event) => onChange({ say: event.target.value })} />
        </label>
      )}
      <label className="course-field">
        <span>Caption</span>
        <input value={ply.caption ?? ''} placeholder={videoCaption({ ...ply, caption: undefined })} onChange={(event) => onChange({ caption: event.target.value || undefined })} />
      </label>
    </div>
  );
}

function Arrows({ arrows, drawnArrows, onChange }: { arrows: CourseArrow[]; drawnArrows: BoardArrow[]; onChange: (arrows: CourseArrow[]) => void }): ReactNode {
  return (
    <>
      <div className="course-arrows">
        {arrows.map((arrow, index) => (
          <button
            key={`${arrow.from}${arrow.to}${arrow.kind}`}
            type="button"
            className={`course-chip course-chip--${arrow.kind}`}
            title="Remove this arrow"
            onClick={() => onChange(arrows.filter((_arrow, at) => at !== index))}
          >
            {arrow.from === arrow.to ? arrow.from : `${arrow.from}→${arrow.to}`} · {arrow.kind} ✕
          </button>
        ))}
      </div>
      <div className="course-arrows">
        <span className="meta">{drawnArrows.length ? `Add the ${drawnArrows.length} drawn as:` : 'Tap two squares on the board to draw an arrow.'}</span>
        {drawnArrows.length > 0 &&
          COURSE_ARROW_KINDS.map((kind) => (
            <button key={kind} type="button" className="btn-secondary" onClick={() => onChange([...arrows, ...fromDrawnArrows(drawnArrows, kind)])}>
              {kind}
            </button>
          ))}
      </div>
    </>
  );
}

/** This episode's part of the YouTube video: each move that speaks, with
 * what it says and shows, and the rough length. */
function VideoScript({ document, episode }: { document: CourseDocument; episode: CourseEpisode }): ReactNode {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const videoPlies = episode.plies.filter((ply) => ply.video);
  return (
    <section className="course-panel__section" aria-label="The video's script">
      <p className="meta">About {videoSecondsOf(episode)} s of the video. Tick a move “In the video” on the Moves tab to add it.</p>
      {videoPlies.length ? (
        <ol className="course-script">
          {videoPlies.map((ply) => {
            const node = byId.get(ply.nodeId);
            return (
              <li key={ply.nodeId}>
                <strong>{node ? moveLabel(document, node) : ply.nodeId}</strong> {videoLine(ply) || <span className="meta">(no words)</span>}
                <span className="meta"> «{videoCaption(ply)}»</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="meta">No move speaks in the video yet.</p>
      )}
    </section>
  );
}
