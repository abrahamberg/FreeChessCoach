import type { ReasoningEffort, TierReasoning } from '@freechesscoach/shared';
import type { ReactNode } from 'react';

const LEVELS: ReadonlyArray<{ value: ReasoningEffort; label: string }> = [
  { value: 'none', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }
];

export interface ThinkingLevelFieldsProps {
  reasoning: TierReasoning;
  onChange: (reasoning: TierReasoning) => void;
  isLocal: boolean;
}

/** Advanced: how hard each model thinks before answering. "Default" leaves
 * it to this site's tuning (cloud) or Off (local). */
export function ThinkingLevelFields({ reasoning, onChange, isLocal }: ThinkingLevelFieldsProps): ReactNode {
  const defaultLabel = isLocal ? 'Default (Off)' : 'Default';
  return (
    <>
      <label htmlFor="llm-thinking-high">Thinking level — high model (the coach)</label>
      <ThinkingSelect id="llm-thinking-high" value={reasoning.standard} defaultLabel={defaultLabel} onChange={(standard) => onChange({ ...reasoning, standard })} />
      <label htmlFor="llm-thinking-low">Thinking level — low model (summaries)</label>
      <ThinkingSelect id="llm-thinking-low" value={reasoning.light} defaultLabel={defaultLabel} onChange={(light) => onChange({ ...reasoning, light })} />
      <p className="settings-page__hint">
        {isLocal
          ? 'More thinking is slower on your own hardware and can use up the reply budget before the model answers. Some local models ignore this setting.'
          : 'More thinking costs more tokens and time. Models that do not support a level ignore it.'}
      </p>
    </>
  );
}

function ThinkingSelect({
  id,
  value,
  defaultLabel,
  onChange
}: {
  id: string;
  value: ReasoningEffort | undefined;
  defaultLabel: string;
  onChange: (value: ReasoningEffort | undefined) => void;
}): ReactNode {
  return (
    <select id={id} value={value ?? ''} onChange={(event) => onChange(toEffort(event.target.value))}>
      <option value="">{defaultLabel}</option>
      {LEVELS.map((level) => (
        <option key={level.value} value={level.value}>
          {level.label}
        </option>
      ))}
    </select>
  );
}

function toEffort(value: string): ReasoningEffort | undefined {
  return LEVELS.find((level) => level.value === value)?.value;
}
