import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { EyeIcon, EyeOffIcon } from '../../components/Icon.js';
import './PhraseInput.css';

export type PhraseInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** An unlock-phrase field that starts visible (people mistype phrases they
 * can't see) with a compact Show/Hide toggle inside its right edge. The
 * toggle blinks a few times on mount so it's noticed without taking up a
 * row of its own. */
export function PhraseInput(props: PhraseInputProps): ReactNode {
  const [visible, setVisible] = useState(true);
  const label = visible ? 'Hide' : 'Show';

  return (
    <div className="phrase-input">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="phrase-input__toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={`${label} unlock phrase`}
        aria-pressed={!visible}
        title={`${label} unlock phrase`}
        disabled={props.disabled}
      >
        {visible ? <EyeOffIcon width={16} height={16} /> : <EyeIcon width={16} height={16} />}
        <span>{label}</span>
      </button>
    </div>
  );
}
