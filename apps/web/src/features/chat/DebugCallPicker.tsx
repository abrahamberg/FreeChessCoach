import type { ReactNode } from 'react';
import './DebugCallPicker.css';

export interface DebugCallPickerItem {
  key: string;
  label: string;
  /** A short verdict after the label (the course's "✓" / "✗2"); none for chat turns. */
  mark?: { text: string; tone: 'ok' | 'bad' | 'pending' };
}

/** The strip of AI calls atop "Debug last answer": the course's outline and
 * episode calls, a session's last turns. Numbered oldest first. */
export function DebugCallPicker({
  items,
  index,
  label,
  onPick
}: {
  items: DebugCallPickerItem[];
  index: number;
  /** Accessible name of the strip ("AI calls", "Coach turns"). */
  label: string;
  onPick: (index: number) => void;
}): ReactNode {
  return (
    <div className="debug-picker" role="tablist" aria-label={label}>
      {items.map((item, position) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={position === index}
          className={`debug-panel__btn debug-picker__chip${position === index ? ' debug-picker__chip--active' : ''}`}
          onClick={() => onPick(position)}
        >
          {position + 1}. {item.label}
          {item.mark && ' '}
          {item.mark && <span className={`debug-picker__mark debug-picker__mark--${item.mark.tone}`}>{item.mark.text}</span>}
        </button>
      ))}
    </div>
  );
}
