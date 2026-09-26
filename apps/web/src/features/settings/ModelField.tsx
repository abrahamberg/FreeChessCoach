import type { ReactNode } from 'react';

export interface ModelFieldProps {
  id: string;
  label: string;
  value: string;
  /** The server's or provider's models; empty means type the name in. */
  models: string[];
  onChange: (model: string) => void;
  optional?: boolean;
  /** Text for the empty choice of an optional field. */
  emptyLabel?: string;
}

/** A dropdown of the listed models, keeping the current value even when the
 * list doesn't have it; a plain text box when there is no list. */
export function ModelField({ id, label, value, models, onChange, optional = false, emptyLabel = 'Same as the model above' }: ModelFieldProps): ReactNode {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      {models.length > 0 ? (
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} required={!optional}>
          {optional && <option value="">{emptyLabel}</option>}
          {!optional && !models.includes(value) && <option value={value}>{value || 'Choose a model'}</option>}
          {optional && value !== '' && !models.includes(value) && <option value={value}>{value}</option>}
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      ) : (
        <input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={optional ? emptyLabel : 'Model name'} required={!optional} />
      )}
    </>
  );
}
