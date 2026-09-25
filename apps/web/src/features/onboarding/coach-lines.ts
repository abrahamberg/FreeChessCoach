import type { CoachPersona } from '@freechesscoach/shared';

export const ONBOARDING_STEPS = ['you', 'coach', 'engine', 'accounts', 'tour', 'ai', 'voice', 'bugs', 'habits', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  you: 'You',
  coach: 'Coach',
  engine: 'Engine',
  accounts: 'Accounts',
  tour: 'Tour',
  ai: 'AI',
  voice: 'Voice',
  bugs: 'Bugs',
  habits: 'Habits',
  done: 'Done'
};

interface PersonaVoice {
  /** Opens the first step. */
  hello: string;
  /** Opens the coach step, so each coach clicked there answers in its own voice. */
  preview: string;
  /** Opens the step right after the student picked this coach. */
  picked: string;
  /** Opens the how-to-use step, the one that decides whether this works. */
  habits: string;
  /** Opens the last step. */
  goodbye: string;
}

const CLASSIC_MALE: PersonaVoice = {
  hello: 'Welcome! I’m your coach, and I’ll walk you through setting things up.',
  preview: 'This is how I sound: calm and clear, and I ask before I tell.',
  picked: 'Good, I’ll be with you from here.',
  habits: 'Now the important part.',
  goodbye: 'That’s everything.'
};

const CLASSIC_FEMALE: PersonaVoice = {
  hello: 'Hi, welcome! I’m your coach. Let’s get you set up together.',
  preview: 'Hi, that’s me: warm and encouraging, and I’ll help you find the answer yourself.',
  picked: 'Lovely, we’ll take it from here.',
  habits: 'Now, the part that matters most.',
  goodbye: 'And that’s it, you’re all set.'
};

/** Only the framing changes per coach, never the advice: the same rule the
 * personas follow in the coach prompt (coaches.md). */
const PERSONA_VOICES: Record<CoachPersona, PersonaVoice> = {
  general: CLASSIC_MALE,
  general_female: CLASSIC_FEMALE,
  commander: {
    hello: 'Listen up. A few minutes of setup, then we train.',
    preview: 'Eyes up. I give the orders, you follow them, and you get better.',
    picked: 'Understood. Discipline starts now.',
    habits: 'Now the part that decides everything: consistency.',
    goodbye: 'Setup done. No excuses now.'
  },
  scholar: {
    hello: 'Welcome. We will set things up carefully, and I will explain why as we go.',
    preview: 'Ah, a curious student. I will always tell you why, not only what.',
    picked: 'A thoughtful choice.',
    habits: 'Now, a word on how learning actually works.',
    goodbye: 'Now the real learning begins.'
  },
  huntress: {
    hello: 'Welcome. Quick setup, then we hunt down your mistakes.',
    preview: 'I will be hunting your weak moves. Nothing gets past me.',
    picked: 'Good. Stay sharp.',
    habits: 'Now, how we win this over time.',
    goodbye: 'Ready. Let’s go find what you missed.'
  },
  shark: {
    hello: 'Hey hey! Quick setup and we’re in business!',
    preview: 'Ha! I’m loud, I’m funny, and I’ll still make you better!',
    picked: 'Ha! Great pick, kid.',
    habits: 'Alright, here’s the secret sauce, kid!',
    goodbye: 'Boom! Done!'
  },
  sunzi: {
    hello: 'Welcome. The board is won or lost in the preparation.',
    preview: 'The wise player studies the board before the move. So shall we.',
    picked: 'The path is chosen.',
    habits: 'Patience over time defeats force in a day.',
    goodbye: 'Preparation is complete.'
  },
  gambler: {
    hello: 'Well, well, a new player at my table. Quick setup, then we play.',
    preview: 'Pick me and I will tease you, roast you, and win you some rating points.',
    picked: 'Bold choice. I like you.',
    habits: 'Here’s the only bet that always pays: showing up.',
    goodbye: 'All in!'
  }
};

export interface CoachLineContext {
  persona: CoachPersona;
  /** Whether an AI setup is saved, known once the AI step has been passed. */
  aiConfigured: boolean;
}

const BODIES: Record<OnboardingStep, (context: CoachLineContext) => string> = {
  you: () => 'First things first: what’s your name? Not your login, the name you’d like to hear from me. Then tell me roughly how strong you are, so I can pitch my advice at your level.',
  coach: () => 'Who do you want coaching you? It is only the voice. The chess advice is identical for every coach.',
  engine: () =>
    'The chess engine checks every move for me. The default is a free cloud engine, and it suits almost everyone.',
  accounts: () =>
    'If you play on Lichess or Chess.com, give me your usernames so I know which side is yours when you import a game. Skip this if you don’t.',
  tour: () =>
    'This is what we will do together. Press Try it live on any card to open a sample with a made-up player, and use Back to setup to return here. Nothing in the sample is saved.',
  ai: () =>
    'One optional thing left: the AI that lets me talk through your games with you. Import, stats, review and the bots all work without it.',
  voice: ({ aiConfigured }) =>
    aiConfigured
      ? 'Do you want me to read my replies aloud? Since your AI is set up, the OpenAI voice is available too. Each option below says what it costs and what the catch is.'
      : 'Do you want my replies read aloud? Without an AI setup the free device voice is picked for you. Each option below says what it costs and what the catch is.',
  bugs: () =>
    'An honest word before we finish: this platform is new, so it can behave unexpectedly, and I can get things wrong.',
  habits: () => 'This is how it is meant to be used. Please read it, because it is what makes the difference.',
  done: () => 'Import your first game and we will go through it together.'
};

/** What the selected coach says on a step. The coach is picked on the
 * 'coach' step, so the step after it thanks them. */
export function coachSays(step: OnboardingStep, context: CoachLineContext): string {
  const voice = PERSONA_VOICES[context.persona];
  return [openingFor(step, voice), BODIES[step](context)].filter(Boolean).join(' ');
}

function openingFor(step: OnboardingStep, voice: PersonaVoice): string {
  if (step === 'you') return voice.hello;
  if (step === 'coach') return voice.preview;
  if (step === 'engine') return voice.picked;
  if (step === 'habits') return voice.habits;
  if (step === 'done') return voice.goodbye;
  return '';
}
