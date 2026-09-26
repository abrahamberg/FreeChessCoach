import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface SettingsSectionProps {
  /** Also the URL fragment that opens it (/settings#settings-engine). */
  id?: string;
  label: string;
  title: string;
  children: ReactNode;
}

/** One Settings card, collapsed until the user opens it — except when the URL
 * fragment names it, so deep links (engine indicator, "set up AI" prompts)
 * land on an open section. Open state isn't remembered between visits. */
export function SettingsSection({ id, label, title, children }: SettingsSectionProps): ReactNode {
  const { hash } = useLocation();
  const isLinked = id !== undefined && hash === `#${id}`;
  const [open, setOpen] = useState(isLinked);

  // A link followed while already on /settings changes the hash without
  // remounting, so open the newly targeted section here too.
  useEffect(() => {
    if (isLinked) setOpen(true);
  }, [isLinked]);

  return (
    <section id={id} aria-label={label} className="card settings-section">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="settings-section__summary">
          <h2>{title}</h2>
        </summary>
        <div className="settings-section__body">{children}</div>
      </details>
    </section>
  );
}
