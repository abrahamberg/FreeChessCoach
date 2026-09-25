import type { ReactNode } from 'react';
import { CalendarIcon, LightbulbIcon, PawnIcon, PlayCircleIcon, TrendingUpIcon, ImportIcon } from '../../components/Icon.js';
import { StatChips, StepCards, type StatChipData, type StepCardData } from './StepCards.js';

const CHIPS: readonly StatChipData[] = [
  { Icon: ImportIcon, value: '15+', label: 'games imported' },
  { Icon: CalendarIcon, value: 'Daily', label: 'games and a session' },
  { Icon: PawnIcon, value: '10 min', label: 'rapid, real people' }
];

/** How the platform is meant to be used, in the coach's own first person. */
const CARDS: readonly StepCardData[] = [
  {
    Icon: PlayCircleIcon,
    title: 'Every day',
    text: 'Play, then import your games. I need at least 15 before your analytics are accurate. Have one coaching session with me a day, skim the important moments of your other games, and play against me a few times a week.'
  },
  {
    Icon: PawnIcon,
    title: 'Play lots of 10-minute rapid games',
    text: 'Against real people, every day. Don’t worry about losing or about your rating while you do. Your rating improves over time, and that is the whole idea.'
  },
  {
    Icon: TrendingUpIcon,
    title: 'Come back regularly, best every day',
    text: 'One coaching session is not magic. First I need to get to know you over a few sessions, then we work on the points that need improvement. A steady number of games each day beats one long day and then a week of silence, even when you spend the same total time.'
  },
  {
    Icon: LightbulbIcon,
    title: 'I am an AI, and I can make mistakes',
    text: 'Report bugs and use your own judgement. I will help you improve, and that is what matters.'
  }
];

export function HabitsStep(): ReactNode {
  return (
    <div className="onboarding__prose">
      <StatChips chips={CHIPS} />
      <StepCards cards={CARDS} />
    </div>
  );
}
