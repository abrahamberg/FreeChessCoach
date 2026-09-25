import type { ReactNode } from 'react';
import { PlugIcon, SettingsIcon } from '../../components/Icon.js';
import { StepCards, type StepCardData } from './StepCards.js';

const CARDS: readonly StepCardData[] = [
  {
    Icon: PlugIcon,
    title: 'Use a single tab and keep it open',
    text: (
      <>
        <span className="onboarding__para">
          Our local options (your AI model, your voice and even the chess engine) run on your computer or in your browser.
          We reach them safely <em>through your browser</em>, using a special technology.
        </span>
        <span className="onboarding__para">
          <strong>While we analyze your games, keep this tab open.</strong> You can switch to another tab and do something
          else, even after importing 10 games. Just don’t close it.
        </span>
        <span className="onboarding__para">
          <strong>Use one tab at a time.</strong> A second tab will ask to take over the work.
        </span>
      </>
    )
  },
  {
    Icon: SettingsIcon,
    title: 'Change anything later',
    text: 'Every choice you made here lives in Settings, and you can run this guide again from there.'
  }
];

export function DoneStep(): ReactNode {
  return <StepCards cards={CARDS} single />;
}
