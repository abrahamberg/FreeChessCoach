import { courseFenBefore, moveLabel, type CourseTree } from '@freechesscoach/chess-analysis';

/** One line of the creator's text as the intake form shows it. */
export interface IntakeLineRow {
  lineId: string;
  name: string;
  note: string | null;
  /** Where it leaves the lines before it ("8.Bd5"); null for the first line. */
  from: string | null;
  /** The moves only this line has (the ones no earlier line has). */
  added: number;
  /** The line's last node: the form shows its end position. */
  leafNodeId: string;
}

/** A row per line. A node belongs to the first line through it, so the rows'
 * `added` counts sum to the tree's node count. */
export function intakeLineRows(tree: Pick<CourseTree, 'startFen' | 'nodes' | 'lines'>): IntakeLineRow[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  return tree.lines.map((line, index) => {
    const own = tree.nodes.filter((node) => node.lineId === line.id);
    const first = own[0];
    const from = index === 0 || !first ? null : moveLabel(courseFenBefore(byId, tree.startFen, first), first.san, '...');
    return { lineId: line.id, name: line.name, note: line.note, from, added: own.length, leafNodeId: line.leafNodeId };
  });
}
