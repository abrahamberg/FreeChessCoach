import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Side = 'white' | 'black';

/** The page's board as the student sees it now: the position shown (the line
 * being browsed, not the game's last move) and the side at the bottom. */
export interface ShownBoard {
  fen: string;
  orientation: Side;
}

interface BoardToolsState {
  board: ShownBoard | null;
  flipped: boolean;
  flip: () => void;
  setBoard: (board: ShownBoard | null) => void;
  setFlipped: (flipped: boolean) => void;
}

const BoardToolsContext = createContext<BoardToolsState>({
  board: null,
  flipped: false,
  flip: () => undefined,
  setBoard: () => undefined,
  setFlipped: () => undefined
});

/** One per app (AppShell): the page's CoachBoard reports itself here, so the
 * tools that act on it (BoardToolbar in a side column, the header menu's
 * items) need no props threaded through the page. */
export function BoardToolsProvider({ children }: { children: ReactNode }): ReactNode {
  const [board, setBoard] = useState<ShownBoard | null>(null);
  const [flipped, setFlipped] = useState(false);
  const flip = useCallback(() => setFlipped((was) => !was), []);
  const value = useMemo(() => ({ board, flipped, flip, setBoard, setFlipped }), [board, flipped, flip]);
  return <BoardToolsContext.Provider value={value}>{children}</BoardToolsContext.Provider>;
}

export function useBoardTools(): Pick<BoardToolsState, 'board' | 'flip'> {
  const { board, flip } = useContext(BoardToolsContext);
  return { board, flip };
}

function opposite(side: Side): Side {
  return side === 'white' ? 'black' : 'white';
}

/** `orientation` turned by the student's flip, for what sits beside the board (EvalBar). */
export function useFlippedSide(orientation: Side): Side {
  return useContext(BoardToolsContext).flipped ? opposite(orientation) : orientation;
}

/** CoachBoard: reports the shown position and returns the side to draw at
 * the bottom. Leaving the page (the board unmounting) forgets the flip. */
export function useShownOrientation(fen: string, orientation: Side): Side {
  const { setBoard, setFlipped } = useContext(BoardToolsContext);
  const shown = useFlippedSide(orientation);
  useEffect(() => {
    setBoard({ fen, orientation: shown });
  }, [fen, shown, setBoard]);
  useEffect(
    () => () => {
      setBoard(null);
      setFlipped(false);
    },
    [setBoard, setFlipped]
  );
  return shown;
}
