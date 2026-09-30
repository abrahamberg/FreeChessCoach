/** Phrases that could come out of any chatbot. The chat personas are told
 * never to say them (prompts coach-persona.ts), and the course verifier
 * flags them in a script (chess-analysis course-verify.ts). */
export const BANNED_GENERIC_PHRASES = [
  'great question',
  'certainly!',
  "I'd be happy to help",
  "let's dive in",
  "it's important to note",
  'feel free to',
  'as an AI'
] as const;

/** docs/courses.md §13.3: a reel's call to action must say what the viewer
 * gets ("Follow for a daily mate-in-3"), never these. */
export const GENERIC_CTAS = ['subscribe for more', 'like and subscribe', 'follow for more', 'hit the bell', 'smash that like'] as const;

/** §13.3–13.4: a video or reel starts on the idea, never on these. */
export const VIDEO_INTRO_PHRASES = ['hey guys', 'hi guys', 'welcome back', 'today we', "today i'm", 'in this video'] as const;
