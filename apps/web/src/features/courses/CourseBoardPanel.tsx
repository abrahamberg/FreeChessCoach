import type { CourseArrow, CourseDocument } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { CoachBoard, type BoardArrow } from '../board/CoachBoard.js';
import { toBoardMarks } from './courseArrows.js';
import { moveLabel } from './courseEdits.js';

export interface CourseBoardPanelProps {
  document: CourseDocument;
  /** The moves the creator can step through (the selected episode's). */
  nodeIds: string[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  /** The selected move's note arrows, shown on the board. */
  arrows: CourseArrow[];
  onDrawnArrows: (arrows: BoardArrow[]) => void;
}

/** Middle column: the position after the selected move. Tapping two
 * squares draws an arrow (the board's tap-to-draw), which the episode
 * panel can add to the note. */
export function CourseBoardPanel({ document, nodeIds, selectedNodeId, onSelectNode, arrows, onDrawnArrows }: CourseBoardPanelProps): ReactNode {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const selected = selectedNodeId ? byId.get(selectedNodeId) : undefined;
  const index = selectedNodeId ? nodeIds.indexOf(selectedNodeId) : -1;
  const marks = toBoardMarks(arrows);
  const step = (offset: number): void => {
    const next = nodeIds[index + offset];
    if (next) onSelectNode(next);
  };

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
      <div className="course-board__nav">
        <button type="button" className="btn-secondary" onClick={() => step(-1)} disabled={index <= 0}>
          Previous
        </button>
        <button type="button" className="btn-secondary" onClick={() => step(1)} disabled={index < 0 || index >= nodeIds.length - 1}>
          Next
        </button>
      </div>
      <div className="course-board__moves" role="list" aria-label="Moves">
        {nodeIds.map((nodeId) => {
          const node = byId.get(nodeId);
          if (!node) return null;
          return (
            <button
              key={nodeId}
              type="button"
              role="listitem"
              className={nodeId === selectedNodeId ? 'course-chip course-chip--selected' : 'course-chip'}
              onClick={() => onSelectNode(nodeId)}
            >
              {moveLabel(document, node)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
