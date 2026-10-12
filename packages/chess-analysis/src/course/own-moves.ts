/** Each line's own moves: the ones no earlier line has. Lines share their
 * first moves (a sideline leaves the main line where it branches), so the
 * pieces together are every node of the tree, once. */
export function ownMoves(lines: readonly { nodeIds: readonly string[] }[]): string[][] {
  const seen = new Set<string>();
  return lines.map((line) => {
    const own = line.nodeIds.filter((id) => !seen.has(id));
    for (const id of own) seen.add(id);
    return own;
  });
}
