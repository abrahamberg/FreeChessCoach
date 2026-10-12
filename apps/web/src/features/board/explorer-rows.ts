import { childrenOf, gameLine, type PgnTree, type PgnTreeNode } from '@freechesscoach/chess-analysis';
import { moveListStart, type MoveListStart } from './moveListStart.js';

export interface ExplorerCell {
  nodeId: string;
  san: string;
}

/** A numbered row of the main line; `white` is absent on a Black-first start and
 * on the row that continues after a variation block ("8… Rb8"). */
export interface PairRow {
  kind: 'pair';
  moveNumber: number;
  white?: ExplorerCell;
  black?: ExplorerCell;
}

/** One piece of a variation written as running text: a move (with its number
 * when the text needs one: `8.`, `8...`), or a bracket for a variation inside it. */
export type VariationItem =
  | { type: 'move'; nodeId: string; san: string; number: string | null }
  | { type: 'open' }
  | { type: 'close' };

/** A variation block under the row of the move it replaces (or after the last row, a move explored from the game's end). */
export interface VariationRow {
  kind: 'variation';
  items: VariationItem[];
  /** Only a branch made in the explorer (an `x` id) may be removed. */
  removable: boolean;
}

export type ExplorerRow = PairRow | VariationRow;

/** The rows to draw for a tree: the main line in numbered rows, each variation
 * of a main-line move as a block under that move's row. After a block that
 * follows White's move, the row that continues starts with Black's move alone. */
export function explorerRows(tree: PgnTree): ExplorerRow[] {
  const start = moveListStart(tree.startFen);
  const rows: ExplorerRow[] = [];
  let open: PairRow | null = null;

  const game = gameLine(tree);
  game.forEach((node, index) => {
    const { moveNumber, black } = numberAt(start, index + 1);
    const cell: ExplorerCell = { nodeId: node.id, san: node.san };
    if (!black) {
      open = { kind: 'pair', moveNumber, white: cell };
      rows.push(open);
    } else if (open?.white && !open.black) {
      open.black = cell;
    } else {
      open = { kind: 'pair', moveNumber, black: cell };
      rows.push(open);
    }
    const alternatives = childrenOf(tree, node.parentId).slice(1);
    for (const alternative of alternatives) rows.push(variationRow(tree, start, alternative, index + 1));
    if (alternatives.length > 0) open = null;
  });
  // Moves explored from the game's last position continue it as variations.
  for (const continuation of childrenOf(tree, game.at(-1)?.id ?? null)) rows.push(variationRow(tree, start, continuation, game.length + 1));
  return rows;
}

function variationRow(tree: PgnTree, start: MoveListStart, first: PgnTreeNode, ply: number): VariationRow {
  const items: VariationItem[] = [];
  appendLine(tree, start, first, ply, items);
  return { kind: 'variation', items, removable: first.id.startsWith('x') };
}

/** `first` and the first-child chain after it; each later move's own
 * alternatives follow it in brackets. */
function appendLine(tree: PgnTree, start: MoveListStart, first: PgnTreeNode, firstPly: number, items: VariationItem[]): void {
  let node: PgnTreeNode | undefined = first;
  let ply = firstPly;
  let needsNumber = true;
  while (node) {
    const { moveNumber, black } = numberAt(start, ply);
    const number = !black ? `${moveNumber}.` : needsNumber ? `${moveNumber}...` : null;
    items.push({ type: 'move', nodeId: node.id, san: node.san, number });
    needsNumber = false;
    if (node !== first) {
      for (const alternative of childrenOf(tree, node.parentId).slice(1)) {
        items.push({ type: 'open' });
        appendLine(tree, start, alternative, ply, items);
        items.push({ type: 'close' });
        needsNumber = true;
      }
    }
    node = childrenOf(tree, node.id)[0];
    ply += 1;
  }
}

/** The move number and side of the move at 1-based `ply` of a tree starting at `start`. */
function numberAt(start: MoveListStart, ply: number): { moveNumber: number; black: boolean } {
  const half = ply - 1 + (start.blackFirst ? 1 : 0);
  return { moveNumber: start.moveNumber + Math.floor(half / 2), black: half % 2 === 1 };
}
