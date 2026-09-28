import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { OverflowMenuItem } from './OverflowMenu.js';

interface PageMenuState {
  items: OverflowMenuItem[];
  setItems: (items: OverflowMenuItem[]) => void;
}

const PageMenuContext = createContext<PageMenuState>({ items: [], setItems: () => undefined });

/** The page's own actions for the top bar's avatar menu (UserMenu), as
 * BoardMenu carries them on board routes — e.g. the course editor's "Debug
 * last answer". */
export function PageMenuProvider({ children }: { children: ReactNode }): ReactNode {
  const [items, setItems] = useState<OverflowMenuItem[]>([]);
  return <PageMenuContext.Provider value={{ items, setItems }}>{children}</PageMenuContext.Provider>;
}

/** Shows `items` in the avatar menu while the calling page is mounted. Pass a
 * memoized array: a new one each render would re-register every render. */
export function usePageMenuItems(items: OverflowMenuItem[]): void {
  const { setItems } = useContext(PageMenuContext);
  useEffect(() => {
    setItems(items);
    return () => setItems([]);
  }, [items, setItems]);
}

export function usePageMenu(): OverflowMenuItem[] {
  return useContext(PageMenuContext).items;
}
