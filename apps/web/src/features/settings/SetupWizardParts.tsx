import type { ReactNode } from 'react';

/** The numbered step row both AI-setup wizards show. Steps before `active`
 * are done. */
export function WizardSteps({ labels, active }: { labels: readonly string[]; active: number }): ReactNode {
  return (
    <ol className="llm-setup-wizard__steps" aria-label="Setup steps">
      {labels.map((label, index) => (
        <li key={label} className={`llm-setup-wizard__step ${index < active ? 'is-done' : index === active ? 'is-active' : ''}`}>
          <span className="llm-setup-wizard__step-number" aria-hidden="true">{index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function LoaderBlock({ label }: { label: string }): ReactNode {
  return (
    <p className="llm-setup-form__loader" role="status">
      <span className="llm-setup-form__spinner" aria-hidden="true" />
      {label}
    </p>
  );
}

/** A failed test or save, in a box that can't be missed. */
export function ErrorBox({ title, message }: { title: string; message: string | undefined }): ReactNode {
  if (!message) return null;
  return (
    <div className="llm-setup-error" role="alert">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}
