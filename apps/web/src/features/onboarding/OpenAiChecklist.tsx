import type { ReactNode } from 'react';

const OPENAI = 'https://platform.openai.com/settings';

const CHECKLIST = [
  {
    title: 'Create a project just for FreeChessCoach',
    link: `${OPENAI}/organization/projects`,
    linkLabel: 'Open Projects',
    detail: 'Choose Create and name it FreeChessCoach. Its usage and key stay separate from anything else you run.'
  },
  {
    title: 'Turn on data sharing for that project',
    link: `${OPENAI}/organization/data-controls/sharing`,
    linkLabel: 'Open Sharing',
    detail:
      'Under “Share inputs and outputs with OpenAI” choose “Enabled for selected projects” and pick FreeChessCoach. This is what gives you free daily tokens. The trade-off: OpenAI may use your games and coach chats to improve its models.'
  },
  {
    title: 'Set a spending limit and enforce it',
    link: `${OPENAI}/organization/projects`,
    linkLabel: 'Open Projects, then your project’s Limits',
    detail: 'Set a small monthly budget, for example $5, and switch on “Enforce hard limit” so OpenAI stops the key instead of billing past it.'
  },
  {
    title: 'Create an API key for this project',
    link: `${OPENAI}/organization/api-keys`,
    linkLabel: 'Open API keys',
    detail: 'Create a new secret key owned by you, in the FreeChessCoach project. OpenAI shows it once, so copy it and paste it below.'
  }
] as const;

/** The four OpenAI console pages a first-time user has to visit, in order. */
export function OpenAiChecklist(): ReactNode {
  return (
    <ol className="onboarding__checklist">
      {CHECKLIST.map((item) => (
        <li key={item.title}>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
          <a href={item.link} target="_blank" rel="noopener noreferrer">{item.linkLabel}</a>
        </li>
      ))}
      <li className="onboarding__checklist-note">
        Stuck? The <a href="/openai-key" target="_blank" rel="noopener noreferrer">step-by-step guide with screenshots</a> shows each page.
      </li>
    </ol>
  );
}
