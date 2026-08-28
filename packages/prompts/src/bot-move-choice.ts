export interface BotMoveChoiceCandidate {
  moveSan: string;
  cp: number | null;
  mateIn: number | null;
  score: number;
  forkInPlies: number | null;
}

export interface BotMoveChoiceInput {
  botName: string;
  botDescription: string;
  fen: string;
  candidates: BotMoveChoiceCandidate[];
}

export interface BotMoveChoiceMessages {
  system: string;
  user: string;
}

const SYSTEM_PROMPT =
  'You are picking exactly one move on behalf of a chess bot with a distinct personality, from a short list of candidate moves already judged sound enough to consider — you are not evaluating the position yourself, only choosing which of the given candidates best fits this bot\'s personality and playing style. Output ONLY a JSON object matching the schema below. Never invent a move outside the given candidate list.';

const BOT_MOVE_CHOICE_JSON_SCHEMA = '{ "moveSan": string }  // must be exactly one of the candidates\' moveSan values';

/**
 * Play-vs-bot's AI-tiebreak call (apps/api/src/llm/bot-tiebreak.ts): used only
 * when a bot's personality scoring leaves several candidates in a close
 * cluster, to pick a more "human" choice than uniform sampling would. The
 * model never evaluates the position itself — every candidate here already
 * passed the engine+personality scoring pipeline (bot-candidate-score.ts);
 * this call only breaks the tie.
 */
export function buildBotMoveChoiceMessages(input: BotMoveChoiceInput): BotMoveChoiceMessages {
  const user = `BOT PERSONA
${input.botName}: ${input.botDescription}

POSITION (FEN)
${input.fen}

CANDIDATE MOVES (already engine-sound; cp/mateIn are from the bot's own perspective, score is this bot's personality-weighted preference, forkInPlies is how many of the bot's own moves ahead a fork appears, if any)
${JSON.stringify(input.candidates)}

JSON SCHEMA
${BOT_MOVE_CHOICE_JSON_SCHEMA}`;

  return { system: SYSTEM_PROMPT, user };
}
