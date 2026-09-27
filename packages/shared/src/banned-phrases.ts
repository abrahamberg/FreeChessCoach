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
