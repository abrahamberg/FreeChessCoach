import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardIcon, type IconProps, KnightIcon, PawnIcon, UploadIcon } from '../../components/Icon.js';
import './ImportShortcuts.css';

export interface ImportShortcutsProps {
  /** Undefined while the quota is still loading, or if it failed to load —
   * the section still works as pure navigation either way, just without
   * the count. */
  quota?: { used: number; limit: number };
}

interface ImportSource {
  tab: 'lichess' | 'chesscom' | 'paste' | 'upload';
  label: string;
  icon: ComponentType<IconProps>;
}

// No brand logos (this app's one hand-drawn icon family carries no
// third-party marks — see Icon.tsx) — Lichess and Chess.com get their own
// chess-piece icon instead (knight/pawn, both sites' own visual shorthand)
// rather than sharing one generic "web" glyph.
const IMPORT_SOURCES: ImportSource[] = [
  { tab: 'lichess', label: 'Lichess', icon: KnightIcon },
  { tab: 'chesscom', label: 'Chess.com', icon: PawnIcon },
  { tab: 'paste', label: 'Paste PGN', icon: ClipboardIcon },
  { tab: 'upload', label: 'Upload PGN', icon: UploadIcon }
];

/** The Games page's primary CTA (replaces the old lone "Add games" button):
 * a full section fronting every import path with its own icon, so getting
 * more games in is the obvious next step rather than a single small button
 * competing with the tabs and rows below it. Each shortcut deep-links
 * straight into ImportPage's matching tab (`?tab=...`) instead of always
 * landing on Paste. Owns no fetching itself (AGENTS.md rule 7) — GamesPage
 * fetches the quota and passes it down. */
export function ImportShortcuts({ quota }: ImportShortcutsProps): ReactNode {
  const quotaFull = quota !== undefined && quota.used >= quota.limit;
  return (
    <section className="import-shortcuts card" aria-label="Import games">
      <div className="import-shortcuts__header">
        <h2>Import games</h2>
        {quota && (
          <span className={quotaFull ? 'import-shortcuts__quota import-shortcuts__quota--full' : 'import-shortcuts__quota'}>
            {quota.used} of {quota.limit} imported today
          </span>
        )}
      </div>
      <div className="import-shortcuts__options">
        {IMPORT_SOURCES.map(({ tab, label, icon: Icon }) => (
          <Link key={tab} to={`/import?tab=${tab}`} className="import-shortcuts__option">
            <span className="import-shortcuts__option-icon" aria-hidden="true">
              <Icon width={22} height={22} />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
