import type { ComponentType, ReactNode } from 'react';
import type { IconProps } from '../../components/Icon.js';

export interface StepCardData {
  Icon: ComponentType<IconProps>;
  title: string;
  text: ReactNode;
}

/** A point with an icon badge, used by the Bugs, Habits and Done steps. `single` stacks them full width, for long text. */
export function StepCards({ cards, single = false }: { cards: readonly StepCardData[]; single?: boolean }): ReactNode {
  return (
    <div className={single ? 'onboarding__cards onboarding__cards--single' : 'onboarding__cards'}>
      {cards.map(({ Icon, title, text }) => (
        <article key={title} className="onboarding__card">
          <span className="onboarding__badge-icon" aria-hidden="true">
            <Icon width={30} height={30} />
          </span>
          <div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export interface StatChipData {
  Icon: ComponentType<IconProps>;
  value: string;
  label: string;
}

/** The headline numbers of a step, big and quick to read. */
export function StatChips({ chips }: { chips: readonly StatChipData[] }): ReactNode {
  return (
    <ul className="onboarding__chips">
      {chips.map(({ Icon, value, label }) => (
        <li key={label} className="onboarding__chip">
          <Icon width={26} height={26} />
          <strong>{value}</strong>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
