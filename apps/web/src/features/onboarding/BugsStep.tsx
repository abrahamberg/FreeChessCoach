import { BUG_REPORT_LIMITS } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { BugIcon, FlagIcon, LightbulbIcon, MessageCircleIcon, UserIcon } from '../../components/Icon.js';
import { BugReportModal } from '../bug-report/BugReportModal.js';
import { StepCards, type StepCardData } from './StepCards.js';

const CARDS: readonly StepCardData[] = [
  {
    Icon: UserIcon,
    title: 'Community work',
    text: 'Finding bugs is something we do together: you tell us, we fix it, and it gets better for everyone.'
  },
  {
    Icon: MessageCircleIcon,
    title: 'Where it can be wrong',
    text: 'The feedback on your moves and the advice I give tend to be the buggy or incorrect parts, along with plenty more. Use your own judgement.'
  },
  {
    Icon: LightbulbIcon,
    title: 'The AI model matters',
    text: 'I run on an LLM, and the one you choose changes the results a lot. Local models are usually slower and less smart, and can behave strangely.'
  },
  {
    Icon: BugIcon,
    title: 'Report from any page',
    text: (
      <>
        Open the menu (your avatar, top right) and choose <strong>Report a bug</strong>. Say what happened and what you expected.
        You can send {BUG_REPORT_LIMITS.perWindow} reports every {BUG_REPORT_LIMITS.windowMinutes} minutes and {BUG_REPORT_LIMITS.perDay} a day.
      </>
    )
  }
];

/** Sets expectations honestly, and shows where the report form lives. */
export function BugsStep(): ReactNode {
  const [isReporting, setIsReporting] = useState(false);
  return (
    <div className="onboarding__prose">
      <div className="onboarding__callout" role="note">
        <FlagIcon width={26} height={26} />
        <p>
          <strong>This is a new platform, and it can behave unexpectedly.</strong> Please be patient with it, and help us
          make it better.
        </p>
      </div>
      <StepCards cards={CARDS} />
      <button type="button" className="btn-secondary" onClick={() => setIsReporting(true)}>
        <BugIcon width={16} height={16} /> Try the report form
      </button>
      {isReporting && <BugReportModal onClose={() => setIsReporting(false)} />}
    </div>
  );
}
