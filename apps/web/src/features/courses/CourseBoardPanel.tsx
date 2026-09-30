import type { CourseArrow, CourseDocument, CoursePly } from '@freechesscoach/shared';
import { useEffect, type ReactNode } from 'react';
import { CoachBoard, type BoardArrow } from '../board/CoachBoard.js';
import { toBoardMarks } from './courseArrows.js';
import { moveLabel } from './courseEdits.js';
import { StepButtons } from './StepButtons.js';

export interface CourseBoardPanelProps {
  document: CourseDocument;
  /** The moves the creator can step through (the selected episode's). */
  nodeIds: string[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  /** The selected move's note arrows, shown on the board. */
  arrows: CourseArrow[];
  onDrawnArrows: (arrows: BoardArrow[]) => void;
  /** The episode's moves: the chips mark which speak in the course and the video. */
  plies?: readonly CoursePly[];
}

/** The board column: the position after the selected move. Tapping two
 * squares draws an arrow (the board's tap-to-draw), which the episode
 * panel can add to the note. */
export function CourseBoardPanel({ document, nodeIds, selectedNodeId, onSelectNode, arrows, onDrawnArrows, plies = [] }: CourseBoardPanelProps): ReactNode {
  const plyById = new Map(plies.map((ply) => [ply.nodeId, ply]));
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const selected = selectedNodeId ? byId.get(selectedNodeId) : undefined;
  const index = selectedNodeId ? nodeIds.indexOf(selectedNodeId) : -1;
  const marks = toBoardMarks(arrows);
  const step = (offset: number): void => {
    const next = nodeIds[index + offset];
    if (next) onSelectNode(next);
  };

  // ← and → step through the moves, unless the creator is typing or a
  // dialog (the learner preview, publishing) is over the editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target) || window.document.querySelector('[aria-modal="true"]')) return;
      const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const next = offset ? nodeIds[index + offset] : undefined;
      if (!next) return;
      event.preventDefault();
      onSelectNode(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nodeIds, index, onSelectNode]);

  return (
    <div className="course-board">
      <CoachBoard
        fen={selected?.fenAfter ?? document.startFen}
        orientation={document.learnerSide}
        mode="peek"
        arrows={marks.arrows}
        highlights={marks.highlights}
        tapToDrawArrows
        onArrowsChange={onDrawnArrows}
      />
      <StepButtons className="course-board__nav" noun="move" index={index} count={nodeIds.length} onStep={step} arrowKeys>
        <span className="meta course-board__count">{nodeIds.length ? `Move ${index + 1} of ${nodeIds.length}` : 'No moves'}</span>
      </StepButtons>
      <div className="course-board__moves" role="list" aria-label="Moves">
        {nodeIds.map((nodeId) => {
          const node = byId.get(nodeId);
          if (!node) return null;
          const ply = plyById.get(nodeId);
          return (
            <button
              key={nodeId}
              type="button"
              role="listitem"
              className={nodeId === selectedNodeId ? 'course-chip course-chip--selected' : 'course-chip'}
              onClick={() => onSelectNode(nodeId)}
            >
              {moveLabel(document, node)}
              {ply?.course && (
                <span className="course-chip__mark course-chip__mark--long" title="Speaks in the course">
                  <span className="visually-hidden">, in the course</span>
                </span>
              )}
              {ply?.video && (
                <span className="course-chip__mark course-chip__mark--short" title="Speaks in the video">
                  <span className="visually-hidden">, in the video</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO'].includes(target.tagName);
}
