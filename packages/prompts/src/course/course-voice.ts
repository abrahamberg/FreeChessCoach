import { BANNED_GENERIC_PHRASES, type CoachPersona } from '@freechesscoach/shared';
import { PERSONA_WORDS, wordBankSentence, type PersonaWords } from '../persona-words.js';

/** Two narration lines per coach, so the model hears the voice in a clip's
 * rhythm: short, spoken, about the board. No moves in them, so none get copied. */
const CLIP_EXAMPLES: Record<CoachPersona, [string, string]> = {
  general: ['Look at the knight. It has one job here, and it is about to do it.', 'Most players take the pawn. Stop for a second and check what it costs.'],
  general_female: ['Look at the knight. It has one job here, and it is about to do it.', 'Most players take the pawn. Stop for a second and check what it costs.'],
  commander: ['Target: the king. Every piece moves with one mission. Execute.', 'Sloppy. That pawn was guarding the whole position, and you let it go.'],
  scholar: ['Notice the pattern here. The bishop and the queen share one diagonal.', 'Here is the elegant part. The defender has two jobs and time for only one.'],
  huntress: ['The king looks safe. It is not. Watch the corner.', 'One quiet move, and now they are the prey.'],
  shark: ['Bro took the free pawn. Free? Sheesh. Watch this.', 'He thinks he is winning. He is cooked. No cap.'],
  sunzi: ['The strong move waits. Patience first, then the strike.', 'See the terrain as it is. The open file decides this game.'],
  gambler: ['Everybody at this table grabs the pawn. Bro, that is the bluff.', "I'm telling you, push the chips in. The king has nowhere to run."]
};

/** `general` has no chat voice by design; a course still needs one. */
const NEUTRAL: PersonaWords = {
  name: 'the coach',
  identity: 'a calm, clear club coach',
  wordBank: 'plan, idea, notice, look, simple, solid, the key square, the point is, careful'
};

function wordsFor(persona: CoachPersona): { words: PersonaWords; intro: string } {
  if (persona === 'general' || persona === 'general_female') return { words: NEUTRAL, intro: `You are ${NEUTRAL.identity}.` };
  const words = PERSONA_WORDS[persona];
  return { words, intro: `You are ${words.name}, a chess coach who is ${words.identity}.` };
}

/** docs/courses.md §6.2: the course's coach, without the chat-only rules
 * (greeting once, show_position). Built from the chat's word banks. */
export function buildCourseVoiceBlock(persona: CoachPersona): string {
  const { words, intro } = wordsFor(persona);
  const [first, second] = CLIP_EXAMPLES[persona];
  return [
    `VOICE: ${intro}`,
    `Words you reach for: ${wordBankSentence(words)}`,
    `Words you never use: ${BANNED_GENERIC_PHRASES.map((phrase) => `"${phrase}"`).join(', ')}.`,
    `How it sounds in a video: "${first}" / "${second}"`,
    'Voice changes how you say things, never what is true about the position.'
  ].join('\n');
}
