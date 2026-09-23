import type { CoachingPlan, CoachPersona, RatingBand, SessionMode } from '@freechesscoach/shared';
import { CALIBRATION } from './calibration.js';
import {
  BOUNDARIES,
  CONVERSATION_THREADING,
  ENGINE_VISIBILITY,
  FOCUS_AREA_LIFECYCLE,
  FORMATTING,
  GROUND_TRUTH,
  HOMEWORK_OPTIONS,
  SESSION_GOALS,
  WHO_YOU_ARE,
  howYouRunTheSession
} from './coach-method.js';
import { PERSONA_VOICE } from './coach-persona.js';
import { PLAY_SESSION_FLOW, SESSION_FLOW } from './coach-session-flow.js';
import {
  ACTIVE_DIAGNOSIS_CODES,
  MISTAKE_CATEGORIES_BLOCK,
  briefToolCue,
  renderCoachingPlanBlock,
  renderFocusAreasBlock,
  renderRecentFindingsBlock,
  renderScopedDiagnosisCodes,
  type FocusAreaSummary,
  type RecentFinding
} from './render.js';
import { COACH_TOOL_SPECS } from './tools.js';
import { PLAY_COACH_TOOL_SPECS } from './tools-play.js';

export interface CoachPromptUser {
  displayName: string;
  selfAssessment: string | null;
  sessionCount: number;
}

export interface GameMeta {
  whiteName: string;
  blackName: string;
  result: string;
  timeControl: string;
  userColor: 'white' | 'black';
}

export interface CoachPromptInput {
  user: CoachPromptUser;
  band: RatingBand;
  /** Numeric Chess.com Rapid rating (`ratingForPromptScoping`'s band-midpoint
   * fallback when unknown) — scopes the diagnosis-code vocabulary below to
   * this student (docs/diagnose.md §0.1), finer than `band` alone. */
  rating: number;
  /** coaches.md: cosmetic voice/tone only — see coach-persona.ts. `general`
   * adds no voice block at all. */
  persona: CoachPersona;
  game: GameMeta;
  mode: SessionMode;
  /** Null in play mode (architecture §14) — there is no pre-session
   * analysis for a live game the student is still playing; required
   * (never null) when mode is 'analyze'. */
  plan: CoachingPlan | null;
  focusAreas: FocusAreaSummary[];
  recentFindings: RecentFinding[];
  /** Injected for deterministic relative-date rendering; defaults to `new Date()`. */
  now?: Date;
  /** A local (LM Studio/Ollama) model is reading this same prompt with a
   * fraction of a cloud model's context budget and no reliable reasoning
   * pass over it — see architecture.md's "Local LLM" section. Trims the
   * one section of the STATIC part that's pure duplication for such a
   * model (yourToolsAndWhenToUseThem's tool prose already rides along
   * verbatim in every tool's own function-calling schema — see
   * tools.ts's COACH_TOOL_SPECS doc comment) down to a one-line-per-tool
   * index instead of repeating each tool's full description a second
   * time. Defaults to false so every existing (cloud) caller is
   * byte-for-byte unchanged. */
  isLocal?: boolean;
}

export interface CoachSystemPrompt {
  staticPart: string;
  dynamicPart: string;
}

/**
 * See docs/prompts.md's "Coach agent system prompt" section for a rendered
 * example. Ordered for architecture §8.1's cache-safe shape rather than
 * human-reading order (which would open with the greeting): the fully
 * user-invariant instructions first (`staticPart`, byte-identical for every
 * user sharing a rating band and every turn), then the per-session user/game
 * data (`dynamicPart`, stable for the whole session but not across users).
 * Gateway callers place a `cache_control` breakpoint after each.
 */
export function buildCoachSystemPrompt(input: CoachPromptInput): CoachSystemPrompt {
  return {
    staticPart: buildStaticPart(input.band, input.mode, input.persona, input.isLocal ?? false),
    dynamicPart: buildDynamicPart(input)
  };
}

/**
 * The cached, per-band/mode/persona-shared layer, so a silent divergence
 * here would be a real cost regression (a busted prompt cache for every
 * session sharing that combination). PERSONA_VOICE['general'] is '', so
 * .filter(Boolean) drops it and adds zero bytes for the default coach.
 *
 * Section order is the reading order the model needs, not a historical one:
 * the voice block leads (coach-persona.ts — it's the frame every other
 * instruction is read through), then who the coach is, then what it may
 * treat as true (GROUND_TRUTH, before any instruction that has it make a
 * claim about a position), then method, then what the session is for, then
 * the mechanics.
 */
function buildStaticPart(band: RatingBand, mode: SessionMode, persona: CoachPersona, isLocal: boolean): string {
  const calibration = CALIBRATION[band];
  return [
    PERSONA_VOICE[persona],
    WHO_YOU_ARE,
    GROUND_TRUTH,
    howYouRunTheSession(calibration.revealDepthPlies),
    SESSION_GOALS,
    FOCUS_AREA_LIFECYCLE,
    HOMEWORK_OPTIONS,
    FORMATTING,
    yourToolsAndWhenToUseThem(mode, isLocal),
    CONVERSATION_THREADING,
    mode === 'play' ? PLAY_SESSION_FLOW : SESSION_FLOW,
    ENGINE_VISIBILITY,
    BOUNDARIES
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildDynamicPart(input: CoachPromptInput): string {
  const now = input.now ?? new Date();
  const calibration = CALIBRATION[input.band];
  const gameSection = input.mode === 'play' ? thisPlayModeGame(input.game) : thisGame(input.game, requirePlan(input.plan));
  return [
    greeting(input.user.displayName),
    yourStudent(input.user, calibration, input.focusAreas, input.recentFindings, now),
    diagnosisCodesForThisStudent(input.rating),
    gameSection
  ].join('\n\n');
}

/** Depends on the numeric rating (unlike the band-keyed rest of the prompt),
 * so this section lives in `dynamicPart`, not `staticPart` — moving it there
 * would either lose §0.1's per-student precision (if downgraded to `band`)
 * or bust the shared per-band cache (if the numeric rating leaked into the
 * part meant to be byte-identical across a whole band). `dynamicPart`
 * already varies per user, so this adds no new cache cost. */
function diagnosisCodesForThisStudent(rating: number): string {
  return `## Diagnosis codes for this student

When you set \`record_finding\`'s diagnosisCode or address a focus area with \`propose_focus_area_update\`, use ONLY a code from this list — it's already scoped to this student's level and to what's actually detectable. Look here first rather than defaulting to skipping it: a real, specific match is worth more than a vague finding. Genuinely nothing here fitting is a normal, correct answer too — leave diagnosisCode unset rather than force or invent one.
${renderScopedDiagnosisCodes(rating, ACTIVE_DIAGNOSIS_CODES)}`;
}

function requirePlan(plan: CoachingPlan | null): CoachingPlan {
  if (!plan) throw new Error('analyze mode requires a non-null coaching plan');
  return plan;
}

function greeting(displayName: string): string {
  return `You are a personal chess coach in a one-on-one session with your student, ${displayName}. You are working through THEIR game with them, over an interactive board that you control with tools.`;
}

function yourStudent(
  user: CoachPromptUser,
  calibration: { label: string; description: string },
  focusAreas: FocusAreaSummary[],
  recentFindings: RecentFinding[],
  now: Date
): string {
  return `## Your student

- Name: ${user.displayName}
- Level: ${calibration.label} (${calibration.description})
- Sessions together so far: ${user.sessionCount}
- Active focus areas (the things you two are currently working on):
${renderFocusAreasBlock(focusAreas, now)}
- Recent findings from past sessions (newest first):
${renderRecentFindingsBlock(recentFindings, now)}
- Student's own words about their weaknesses: "${user.selfAssessment ?? ''}"

This profile, get_diagnostic_profile and get_player_stats are what the session's goal is chosen from — not the impression this one game leaves.`;
}

function thisGame(game: GameMeta, plan: CoachingPlan): string {
  return `## This game

- ${game.whiteName} vs ${game.blackName}, ${game.result}, ${game.timeControl}. Your student played ${game.userColor}. ${resultSentence(game)}${suggestedGoalLine(plan)}
- Preparation summary: ${plan.gameSummary}
- Opening note: ${plan.openingNote}
- Connection to the student's history: ${plan.connectionToHistory}
- Your pre-session preparation notes (from your private analysis — the student has NOT seen these):
${renderCoachingPlanBlock(plan)}

The preparation notes list the moments worth stopping at, with a suggested opening question and the key line for each. They were selected using the student's standing progress and this game's evidence. Treat them as your lesson plan, not a script — spend your time on the moments that serve the session's goal, follow the conversation where it needs to go, and return to the plan when it makes sense.`;
}

/** The raw PGN result token ("1-0"/"0-1"/"1/2-1/2"/"*") is unambiguous to a
 * human coach but is exactly the kind of thing a small local model has been
 * observed to misread or skip past entirely inside a dense line of game
 * metadata — the one fact the whole session's framing depends on (was this
 * a game to fix, or one to reinforce?) then has to be inferred instead of
 * read. Spelling it out in plain English costs one short sentence and never
 * needs a per-move mate symbol or engine eval to be decoded correctly first. */
function resultSentence(game: GameMeta): string {
  const userWon = game.userColor === 'white' ? game.result === '1-0' : game.result === '0-1';
  const userLost = game.userColor === 'white' ? game.result === '0-1' : game.result === '1-0';
  if (userWon) return 'Your student won this game.';
  if (userLost) return 'Your student lost this game.';
  if (game.result === '1/2-1/2') return 'This game ended in a draw.';
  return 'This game has no recorded result.';
}

/** The goal your preparation already proposed (CoachingPlanSchema's
 * `sessionGoal`). Absent on a plan stored before that field existed
 * (jsonb, no migration), in which case the coach picks the goal itself the
 * way "What the session is for" describes — so the line is dropped rather
 * than rendered empty. */
function suggestedGoalLine(plan: CoachingPlan): string {
  if (!plan.sessionGoal) return '';
  return `\n- Goal your preparation proposes for this session: ${plan.sessionGoal} It came from the student's standing evidence, so start there — change it only if the session gives you a real reason (see "What the session is for").`;
}

/** architecture §14: no pre-session preparation plan exists for a live game
 * still being played — the student's active focus areas (already rendered
 * above, in "Your student") stand in for it instead. */
function thisPlayModeGame(game: GameMeta): string {
  const yourColor = game.userColor === 'white' ? 'black' : 'white';
  return `## This game

You are playing a live game WITH your student — they are ${game.userColor}, you are ${yourColor}. This is not "just a game": the point is to test and develop their skills, not to win or lose. There is no pre-session preparation plan the way an imported game has one — their active focus areas above are your plan instead.`;
}

function yourToolsAndWhenToUseThem(mode: SessionMode, isLocal: boolean): string {
  const specs = mode === 'play' ? PLAY_COACH_TOOL_SPECS : COACH_TOOL_SPECS;
  // A local model's own tool-calling schema already carries each tool's
  // full description verbatim (tools.ts's COACH_TOOL_SPECS doc comment) —
  // repeating all of it again here doubles the token cost of tool
  // documentation for a model with the least context to spare. It still
  // gets an index of every tool and a one-line cue for when each fires;
  // the full "how" lives in the schema it already reads to call the tool
  // at all. Cloud sessions keep the full prose unchanged.
  const toolBullets = isLocal
    ? specs.map((spec) => `- ${spec.name}: ${briefToolCue(spec.description)}`).join('\n')
    : specs.map((spec) => `- ${spec.name}: ${spec.description}`).join('\n');
  return `## Your tools and when to use them

${toolBullets}
- The student can draw their own arrows on the board too. When their message contains a token like "[e2-e4]", that is an arrow they drew from e2 to e4 on the CURRENT position — read it as their proposed move or idea, exactly as if they had typed "what about e2-e4?" or pointed at the board and said "here". Respond to what they're pointing at, in the flow of the conversation — never mention the bracket syntax itself. Treat it like any other move you didn't get from a tool: check_moves before you tell them what it does.

Categories for findings and focus areas (use ONLY these):
${MISTAKE_CATEGORIES_BLOCK}`;
}
