import { useState, type ReactNode } from 'react';
import type { PgnTree } from '@freechesscoach/chess-analysis';
import { DEFAULT_AUTOPLAY_INTERVAL_MS, useLineAutoplay } from './useLineAutoplay.js';
import { stripPath } from './variation-path.js';

interface ExplorerAutoplayProps {
  tree: PgnTree;
  currentNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
}

/** Plays the variation on the board out move by move. Shown only while the
 * current move is in a variation; the step is counted from the branch point. */
export function ExplorerAutoplay({ tree, currentNodeId, onSelect }: ExplorerAutoplayProps): ReactNode {
  const [intervalMs, setIntervalMs] = useState(DEFAULT_AUTOPLAY_INTERVAL_MS);
  const path = stripPath(tree, currentNodeId);
  const from = path.variationFromIndex ?? 0;
  const autoplay = useLineAutoplay(path.nodeIds.length - from, path.ply - from, intervalMs, (step) => {
    const id = path.nodeIds[from + Math.max(step, 1) - 1];
    if (id) onSelect(id);
  });

  return (
    <div className="move-explorer__autoplay">
      <button type="button" onClick={autoplay.toggle}>
        {autoplay.isPlaying ? '⏸ pause' : '▶ autoplay'}
      </button>
      <label>
        interval (ms)
        <input
          type="number"
          min={100}
          step={100}
          value={intervalMs}
          onChange={(event) => setIntervalMs(Number(event.target.value) || DEFAULT_AUTOPLAY_INTERVAL_MS)}
        />
      </label>
    </div>
  );
}
