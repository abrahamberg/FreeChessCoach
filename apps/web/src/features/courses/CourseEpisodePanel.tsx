import { clipCaption, clipLine, type CourseArrow, type CourseDocument, type CourseEpisode, type CoursePly } from '@freechesscoach/shared';
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

type Tab = 'moves' | 'quiz' | 'clip' | 'ai';

/** A clip line's rough length: spoken words, and the move shown before it. */
export function clipSecondsOf(episode: CourseEpisode): number {
  const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
  const spoken = (episode.opener ? words(episode.opener.say) : 0) + episode.plies.filter((ply) => ply.short).reduce((sum, ply) => sum + words(clipLine(ply)), 0);
  return Math.round(spoken / 2.6 + episode.plies.filter((ply) => ply.short).length * 0.7);
}

/** Right column (Phase 90): the selected episode's warnings, what speaks
 * against the plan's budget, and tabs: Moves (the selected move for the
 * course and the clip), Quiz, Clip (the clip's script) and AI. */
export function CourseEpisodePanel({ document, episode, direction, nodeIds, selectedNodeId, drawnArrows, onChange, aiWriter }: CourseEpisodePanelProps): ReactNode {
  const [tab, setTab] = useState<Tab>('moves');
  const node = selectedNodeId ? document.nodes.find((candidate) => candidate.id === selectedNodeId) : undefined;
  const ply = episode.plies.find((candidate) => candidate.nodeId === selectedNodeId);
  const answerNode = document.nodes.find((candidate) => candidate.id === episode.quiz?.answerNodeId);
  const change = (patch: Partial<Omit<CoursePly, 'nodeId'>>): void => {
    if (selectedNodeId) onChange(setPly(episode, selectedNodeId, patch, nodeIds));
  };
  const long = episode.plies.filter((each) => each.long).length;
  const short = episode.plies.filter((each) => each.short).length;
  const tabs: [Tab, string][] = [
    ['moves', 'Moves'],
    ['quiz', episode.quiz ? 'Quiz ✓' : 'Quiz'],
    ['clip', 'Clip'],
    ...(aiWriter ? [['ai', 'AI'] as [Tab, string]] : [])
  ];

  return (
    <div className="course-panel course-episode-panel">
      <p className="course-panel__role">{episode.role}</p>
      {/* A version the plan gave 0 was not planned (Phase 91): added by hand, no budget. */}
      <p className="course-budget meta">
        <span className={episode.budget?.long && long > episode.budget.long ? 'course-budget--over' : undefined}>
          {long}
          {episode.budget?.long ? ` of ${episode.budget.long}` : ''} speak in the course
        </span>
        {' · '}
        <span className={episode.budget?.short && short > episode.budget.short ? 'course-budget--over' : undefined}>
          {short}
          {episode.budget?.short ? ` of ${episode.budget.short}` : ''} in the clip
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
                  <button type="button" className="course-ply__tick" aria-pressed={Boolean(ply?.long)} onClick={() => change({ long: !ply?.long })}>
                    In the course
                  </button>
                  <button type="button" className="course-ply__tick" aria-pressed={Boolean(ply?.short)} onClick={() => change({ short: !ply?.short })}>
                    In the clip
                  </button>
                </div>
                <label className="course-field">
                  <span>What the coach says</span>
                  <textarea rows={4} value={ply?.text ?? ''} onChange={(event) => change({ text: event.target.value })} />
                </label>
                {ply?.short && <ClipLineFields ply={ply} onChange={change} />}
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

        {tab === 'clip' && <ClipScript document={document} episode={episode} onChange={onChange} />}

        {tab === 'ai' && aiWriter}
      </div>
    </div>
  );
}

/** A clip move: its own shorter line when it needs one, and the caption. */
function ClipLineFields({ ply, onChange }: { ply: CoursePly; onChange: (patch: Partial<Omit<CoursePly, 'nodeId'>>) => void }): ReactNode {
  const [own, setOwn] = useState(ply.clipText !== undefined);
  return (
    <div className="course-ply__clip">
      <label className="course-ply__own">
        <input
          type="checkbox"
          checked={own}
          onChange={(event) => {
            setOwn(event.target.checked);
            onChange({ clipText: event.target.checked ? (ply.clipText ?? ply.text) : undefined });
          }}
        />
        A different line for the clip
      </label>
      {own && (
        <label className="course-field">
          <span>The clip says</span>
          <textarea rows={2} value={ply.clipText ?? ''} onChange={(event) => onChange({ clipText: event.target.value })} />
        </label>
      )}
      <label className="course-field">
        <span>Caption</span>
        <input value={ply.caption ?? ''} placeholder={clipCaption({ ...ply, caption: undefined })} onChange={(event) => onChange({ caption: event.target.value || undefined })} />
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

/** The clip's script for this episode: the opening card, then each clip move
 * with what it says and shows, and the rough length. */
function ClipScript({ document, episode, onChange }: { document: CourseDocument; episode: CourseEpisode; onChange: (episode: CourseEpisode) => void }): ReactNode {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const clipPlies = episode.plies.filter((ply) => ply.short);
  const withoutOpener = (): CourseEpisode => {
    const next = { ...episode };
    delete next.opener;
    return next;
  };
  return (
    <section className="course-panel__section" aria-label="The clip's script">
      <p className="meta">
        About {clipSecondsOf(episode)} s{document.clipSeconds ? ` (the whole clip aims at ${document.clipSeconds} s)` : ''}. Tick a move “In the clip” on the Moves tab to add it.
      </p>
      {episode.opener ? (
        <div className="course-script__opener">
          <label className="course-field">
            <span>Opening card: the coach says</span>
            <textarea rows={2} value={episode.opener.say} onChange={(event) => episode.opener && onChange({ ...episode, opener: { ...episode.opener, say: event.target.value } })} />
          </label>
          <label className="course-field">
            <span>On screen</span>
            <input value={episode.opener.caption} onChange={(event) => episode.opener && onChange({ ...episode, opener: { ...episode.opener, caption: event.target.value } })} />
          </label>
          <button type="button" className="btn-ghost" onClick={() => onChange(withoutOpener())}>
            Remove the opening card
          </button>
        </div>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => onChange({ ...episode, opener: { say: '', caption: '' } })}>
          Add an opening card
        </button>
      )}
      {clipPlies.length ? (
        <ol className="course-script">
          {clipPlies.map((ply) => {
            const node = byId.get(ply.nodeId);
            return (
              <li key={ply.nodeId}>
                <strong>{node ? moveLabel(document, node) : ply.nodeId}</strong> {clipLine(ply) || <span className="meta">(no words)</span>}
                <span className="meta"> «{clipCaption(ply)}»</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="meta">No move speaks in the clip yet.</p>
      )}
    </section>
  );
}
