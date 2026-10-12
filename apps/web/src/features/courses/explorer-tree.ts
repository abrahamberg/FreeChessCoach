import type { PgnTree } from '@freechesscoach/chess-analysis';
import type { ExplorerNodeExtras } from '../board/explorer-extras.js';

/** The part of a course tree (the intake form's parse, the editor's document)
 * that the explorer draws. */
export interface CourseTreeSource {
  startFen: string;
  nodes: {
    id: string;
    parentId: string | null;
    san: string;
    uci: string;
    fenAfter: string;
    comment: string | null;
    marks: readonly string[];
    glyph: string | null;
  }[];
}

/** A course's moves as the explorer's tree. Nodes keep their order: a node's
 * main continuation comes first. */
export function explorerTree(source: CourseTreeSource): PgnTree {
  return {
    startFen: source.startFen,
    errors: [],
    nodes: source.nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      san: node.san,
      uci: node.uci,
      fenAfter: node.fenAfter,
      comment: node.comment,
      arrows: [],
      branchName: null,
      branchNote: null,
      glyph: node.glyph as PgnTree['nodes'][number]['glyph'],
      marks: node.marks as PgnTree['nodes'][number]['marks']
    }))
  };
}

/** The creator's glyph and marks as badges, their comment as a tooltip; a move in `fadeOutside`'s complement is faded. */
export function explorerExtras(source: CourseTreeSource, inFocus?: ReadonlySet<string>): ExplorerNodeExtras {
  const extras: ExplorerNodeExtras = {};
  for (const node of source.nodes) {
    const badges = [...(node.glyph ? [node.glyph] : []), ...node.marks];
    const dimmed = inFocus !== undefined && !inFocus.has(node.id);
    if (badges.length > 0 || node.comment || dimmed) extras[node.id] = { badges, comment: node.comment, dimmed };
  }
  return extras;
}
