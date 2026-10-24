import type { ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { MoveQualityBadge } from './MoveQualityBadge.js';
import type { ExplorerNodeExtras } from './explorer-extras.js';
import type { VariationRow } from './explorer-rows.js';

interface ExplorerVariationProps {
  row: VariationRow;
  qualities: Record<string, ClassifiedMoveDto>;
  nodeExtras: ExplorerNodeExtras | undefined;
  currentNodeId: string | null;
  onSelect: (nodeId: string) => void;
  /** Given only for a branch the viewer made: a small remove button ends the block. */
  onRemove: ((nodeId: string) => void) | undefined;
  /** Makes a branch the main line (the review's explorer, where any line may become it). */
  onPromote?: (nodeId: string) => void;
}

/** A variation as running text with move numbers and brackets, indented
 * under the row of the move it replaces. */
export function ExplorerVariation({ row, qualities, nodeExtras, currentNodeId, onSelect, onRemove, onPromote }: ExplorerVariationProps): ReactNode {
  const first = row.items.find((item) => item.type === 'move');
  return (
    <li className="move-explorer__variation">
      {row.items.map((item, index) => {
        if (item.type === 'open') return <span key={index} className="move-explorer__bracket">(</span>;
        if (item.type === 'close') {
          return (
            <span key={index} className="move-explorer__bracket">
              <BranchControls nodeId={item.nodeId} removable={item.removable} onRemove={onRemove} onPromote={onPromote} />)
            </span>
          );
        }
        const quality = qualities[item.nodeId]?.quality;
        const extra = nodeExtras?.[item.nodeId];
        return (
          <span key={index} className="move-explorer__variation-move">
            {item.number && <span className="move-explorer__number">{item.number}</span>}
            <button
              type="button"
              className={[quality ? `move-quality-${quality}` : null, extra?.dimmed ? 'move-explorer__move--dimmed' : null].filter(Boolean).join(' ') || undefined}
              title={extra?.comment ?? undefined}
              aria-current={currentNodeId === item.nodeId ? 'true' : undefined}
              onClick={() => onSelect(item.nodeId)}
            >
              <MoveQualityBadge quality={quality} size="sm" />
              {item.san}
              {extra?.badges?.map((badge) => (
                <span key={badge} className="move-explorer__badge">
                  {badge}
                </span>
              ))}
            </button>
          </span>
        );
      })}
      {first?.type === 'move' && <BranchControls nodeId={first.nodeId} removable={row.removable} onRemove={onRemove} onPromote={onPromote} />}
    </li>
  );
}

interface BranchControlsProps {
  nodeId: string;
  removable: boolean;
  onRemove: ((nodeId: string) => void) | undefined;
  onPromote: ((nodeId: string) => void) | undefined;
}

/** What can be done to a whole variation: make it the main line, or (when the viewer made it) remove it. */
function BranchControls({ nodeId, removable, onRemove, onPromote }: BranchControlsProps): ReactNode {
  return (
    <>
      {onPromote && (
        <button type="button" className="move-explorer__remove" aria-label="make this the main line" title="Make main line" onClick={() => onPromote(nodeId)}>
          ↑
        </button>
      )}
      {removable && onRemove && (
        <button type="button" className="move-explorer__remove" aria-label="remove this variation" onClick={() => onRemove(nodeId)}>
          ×
        </button>
      )}
    </>
  );
}
