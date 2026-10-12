/** What a page adds to a move of the explorer: small badges (the creator's
 * glyph and marks), the PGN comment as a tooltip, and whether to fade it. */
export interface ExplorerNodeExtra {
  badges?: string[];
  comment?: string | null;
  dimmed?: boolean;
}

export type ExplorerNodeExtras = Record<string, ExplorerNodeExtra>;
