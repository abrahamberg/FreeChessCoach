import type { ReactNode, SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

/** One consistent stroke-based icon family (design-improvements.md §3/§6:
 * "avoid emoji, use one consistent icon family") — hand-drawn inline SVG
 * rather than an added icon-library dependency (AGENTS.md: don't add a
 * dependency without checking an existing one covers it; none does). Every
 * icon shares the same 24x24 viewBox, 1.75 stroke, round caps/joins. */
function iconProps(props: IconProps): IconProps {
  return {
    viewBox: '0 0 24 24',
    width: 20,
    height: 20,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    ...props
  };
}

export function BoardIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="3.5" y1="14.5" x2="20.5" y2="14.5" />
      <line x1="9.5" y1="3.5" x2="9.5" y2="20.5" />
      <line x1="14.5" y1="3.5" x2="14.5" y2="20.5" />
    </svg>
  );
}

export function TrendingUpIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </svg>
  );
}

export function BarChartIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <line x1="5" y1="20" x2="5" y2="12" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="19" y1="20" x2="19" y2="15" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" fill="var(--color-surface)" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="16" cy="12" r="2" fill="var(--color-surface)" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="11" cy="18" r="2" fill="var(--color-surface)" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <polyline points="15 16 20 11 15 6" />
      <line x1="20" y1="11" x2="8" y2="11" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function MoreVerticalIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps({ strokeWidth: 0, fill: 'currentColor', ...props })}>
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

export function CloseIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function UserIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20c0-4.14 3.36-6.5 7.5-6.5s7.5 2.36 7.5 6.5" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function CheckIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PlusIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

export function PlayCircleIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="11 6 5 12 11 18" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function SkipBackIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <line x1="6" y1="5" x2="6" y2="19" />
      <polygon points="18 5 8 12 18 19" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SkipForwardIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <line x1="18" y1="5" x2="18" y2="19" />
      <polygon points="6 5 16 12 6 19" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlaySmallIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <polygon points="7 5 19 12 7 19" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PauseIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps({ strokeWidth: 0, fill: 'currentColor', ...props })}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function VolumeOnIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M17 9a4 4 0 0 1 0 6" />
      <path d="M19.5 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

export function VolumeOffIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <line x1="17" y1="9" x2="21" y2="15" />
      <line x1="21" y1="9" x2="17" y2="15" />
    </svg>
  );
}

export function UndoIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <polyline points="4 4 4 8 8 8" />
    </svg>
  );
}

export function EyeIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function FlagIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <line x1="5" y1="3" x2="5" y2="21" />
      <path d="M5 4.5c3-1.5 5 1.5 8 0s5-1.5 5-1.5v9s-2 1.5-5 1.5-5-3-8-1.5Z" />
    </svg>
  );
}

export function LightbulbIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.45 1.1 1.2 1.1 2.2h5c0-1 .5-1.75 1.1-2.2A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

export function MessageCircleIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

export function MaximizeIcon(props: IconProps): ReactNode {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 4H5a1 1 0 0 0-1 1v4" />
      <path d="M15 4h4a1 1 0 0 1 1 1v4" />
      <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
      <path d="M15 20h4a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}
