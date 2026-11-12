import { HintMovesResponseSchema, type EngineLine } from '@freechesscoach/shared';
import { createContext, useContext, type ReactNode } from 'react';
import { apiPost } from '../../api/client.js';

/** Where a live review gets the engine's lines for a position. */
export type EngineLinesSource = (fen: string) => Promise<EngineLine[]>;

/** The account's engine, through the server (`/api/positions/hint-moves`). */
const serverLines: EngineLinesSource = async (fen) => {
  const { lines } = await apiPost('/api/positions/hint-moves', { fen }, HintMovesResponseSchema);
  return lines;
};

const EngineLinesContext = createContext<EngineLinesSource>(serverLines);

/** A page with no account (the no-account review) answers with the engine on
 * this device instead; everywhere else the server's is used. */
export function EngineLinesProvider({ source, children }: { source: EngineLinesSource; children: ReactNode }): ReactNode {
  return <EngineLinesContext.Provider value={source}>{children}</EngineLinesContext.Provider>;
}

export function useEngineLinesSource(): EngineLinesSource {
  return useContext(EngineLinesContext);
}
