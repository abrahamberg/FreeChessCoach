import { z } from 'zod';
import { FindingSchema, FocusAreaUpdateSchema, ThreadSchema } from '@freechesscoach/shared';

/** architecture §7.1 — parameter schemas for the coach agent's 17 tools. Pure
 * (no execute functions here); apps/api/src/services/coach-tools.ts binds
 * these to real services to build the AI SDK ToolSet. */

/**
 * Standard chess move-pair terminology ("White's move 2", "Black's move
 * 2") instead of a bare ply — a bare ply number is not how PGN moves are
 * named, and asking the model to convert ply <-> move-pair itself in prose
 * ("White's move N is ply 2N-1") reliably produced miscounted navigation.
 * moveNumber 0 with color null addresses the game's starting position.
 * Shared by every tool that addresses a move in this game (show_position,
 * check_position, record_move_note, recall_move) — never a bare ply,
 * anywhere in the tool surface.
 */
const moveAddressShape = {
  moveNumber: z.number().int().nonnegative(),
  color: z.enum(['white', 'black']).nullable()
};

function refineMoveAddress<T extends { moveNumber: number; color: 'white' | 'black' | null }>(value: T): boolean {
  return value.moveNumber === 0 ? value.color === null : value.color !== null;
}

const MOVE_ADDRESS_REFINEMENT_MESSAGE = 'color must be null only when moveNumber is 0 (the game start)';

/** check_position takes the same {moveNumber, color} address as
 * show_position — it just answers with the FEN instead of moving the
 * student's board. Also the base address shape recall_move uses — neither
 * one touches the board or the conversation's subject, so unlike
 * show_position, neither takes an `intent`. */
export const checkPositionParameters = z
  .object(moveAddressShape)
  .refine(refineMoveAddress, { message: MOVE_ADDRESS_REFINEMENT_MESSAGE });

/** `intent` distinguishes a "flashback" (glance at another move to make a
 * point about the one you're actually discussing — the board moves, the
 * conversation's subject doesn't) from a "subject" change (you're moving on
 * to actually discuss this move — both the board and the subject move, and
 * the old subject's episode folds into a summary, same as show_position's
 * only behavior before this field existed). Always moves the board straight
 * to the real, final position for this move, fully revealed — there is no
 * pre-move/hidden-answer state to opt into. If you want the student to look
 * at a position fresh before hearing your take, let them use Explore on
 * their own, or make your point with annotate_board instead of anchoring
 * the board one ply behind. */
export const showPositionParameters = z
  .object({ ...moveAddressShape, intent: z.enum(['flashback', 'subject']) })
  .refine(refineMoveAddress, { message: MOVE_ADDRESS_REFINEMENT_MESSAGE });

export const annotateBoardParameters = z.object({
  arrows: z.array(z.object({ from: z.string(), to: z.string(), color: z.string() })),
  highlights: z.array(z.object({ square: z.string(), color: z.string() }))
});

export const getEngineAnalysisParameters = z.object({
  fen: z.string()
});

export const getUserProfileParameters = z.object({});

/** Task 57.2 — no arguments: always reports on the current game's own exact
 * time control (§4.2's pooling rule), same "no address to get wrong" shape
 * as get_user_profile. */
export const getDiagnosticProfileParameters = z.object({});

export const recordFindingParameters = FindingSchema;

export const proposeFocusAreaUpdateParameters = FocusAreaUpdateSchema;

export const updateThreadsParameters = z.object({
  threads: z.array(ThreadSchema)
});

export const endSessionParameters = z.object({
  summary: z.string(),
  homework: z.string().nullable()
});

/** design doc §3: coach-authored per-move note, discretionary (same pattern
 * as record_finding — not mandatory every move). Addressed the same way as
 * show_position/check_position ({ moveNumber, color }) — never a bare ply
 * (final review #1): every other context surface speaks move-pair
 * terminology, and a bare ply here was the one place the model was
 * silently likely to miscount. */
export const recordMoveNoteParameters = z
  .object({ ...moveAddressShape, note: z.string().min(1).max(300) })
  .refine(refineMoveAddress, { message: MOVE_ADDRESS_REFINEMENT_MESSAGE });

/** design doc §4: on-demand deeper lookup for a specific past move, same
 * { moveNumber, color } address as show_position/check_position (final
 * review #1) — no `intent`, same reasoning as check_position. */
export const recallMoveParameters = checkPositionParameters;

/** Armed right before a single-move Socratic question ("what would you play
 * here?") so the client sends the student's next board move immediately
 * instead of folding it into a diverged line. Takes no
 * arguments — it's a pure signal, not an address. */
export const expectMoveParameters = z.object({});

/** Sets up or continues a hypothetical continuation off the CURRENT
 * position — e.g. "if Black had played a4 instead". No { moveNumber, color }
 * address like the other move-referencing tools: the base position is
 * implicit (continues an already-active hypothetical on the client, or
 * falls back to wherever the board currently is) rather than a real-game
 * move, which a continuing hypothetical may no longer have. */
export const hypotheticalLineParameters = z.object({
  moves: z.array(z.string().min(1)).min(1).max(12)
});

/** Delegates an open-ended, potentially multi-position question to the
 * investigation sub-agent (apps/api/src/services/position-investigator.ts)
 * — `moves` optionally walks a line onto `fen` first (same SAN-sequence
 * convention as hypothetical_line) before the sub-agent starts exploring. */
export const investigatePositionParameters = z.object({
  fen: z.string(),
  moves: z.array(z.string().min(1)).max(12).optional(),
  question: z.string().min(1)
});

/** The anti-hallucination primitive: pure chess.js legality/consequence
 * checking (chess-analysis's `inspectMoves`), no engine call, so it can be
 * unbudgeted and the coach never has a reason to assert a move from memory
 * instead. Capped at 6 moves per call so one call answers "which of these
 * candidates exist here" without turning into a board dump. */
export const checkMovesParameters = z.object({
  fen: z.string().min(1),
  moves: z.array(z.string().min(1)).min(1).max(6)
});

/** No arguments, same "no address to get wrong" shape as get_user_profile
 * and get_diagnostic_profile — it always reports on the session's own game
 * against that student's own baseline at the same time control. */
export const getPlayerStatsParameters = z.object({});

export interface CoachToolSpec {
  name: string;
  description: string;
}

/**
 * Single source of truth for what the model is told about each tool — one
 * canonical description per tool, reused verbatim as both the `tool({
 * description })` sent with the API's tool-calling schema
 * (apps/api/src/services/coach-tools.ts) AND the "Your tools and when to use
 * them" bullet rendered into the cached static system prompt
 * (coach-system.ts's yourToolsAndWhenToUseThem()). Previously these were two
 * hand-written copies that had already drifted apart; this is the fix. Order
 * here is the order they're presented to the model in.
 */
export const COACH_TOOL_SPECS: readonly CoachToolSpec[] = [
  {
    name: 'show_position',
    description:
      'Move the student\'s board to a move in THIS game AND load that move\'s own analysis. Address the move the way you would say it out loud — { moveNumber, color }: White\'s 18th is { moveNumber: 18, color: "white" }, Black\'s 18th is { moveNumber: 18, color: "black" }, the game\'s starting position is { moveNumber: 0, color: null }. Never a bare ply, never any arithmetic. Wait for the result before you say anything about the move: this call is what refreshes "## Current position" with THIS move\'s engine analysis (the move played, the engine\'s best move and line, the other options) and returns the move\'s real fen. Until it comes back, the analysis in front of you is still the PREVIOUS move\'s and nothing warns you about the mismatch. The returned fen is ground truth — never reconstruct one from memory. Always moves straight to the real, final position, fully revealed — intent: "subject" means you are moving on to discuss this move, so the conversation moves with the board and what you were discussing folds into a summary; "flashback" means you are only glancing at another move to make a point about the one you are still on, so the board moves and the conversation does not.'
  },
  {
    name: 'check_position',
    description:
      'Look up the fen and SAN for any move in THIS game without moving the student\'s board, addressed exactly like show_position ({ moveNumber, color }; the game start is { moveNumber: 0, color: null }). Use it to get a verified fen before get_engine_analysis or check_moves, or to confirm a move exists at all before you refer to it. Free and unbudgeted. NEVER invent or reconstruct a fen, and never refer to a move you have not confirmed exists.'
  },
  {
    name: 'check_moves',
    description:
      'Check whether specific moves are actually legal in a position, and what they actually do — pure board reading, no engine, free and unbudgeted, so there is never a reason to skip it. Pass a fen you got from a tool result plus up to 6 moves in SAN. For each one you get back: legal or NOT legal (and, when not, what that piece can really do here); what it captures, whether it gives check or mate; the fen it reaches; which of the mover\'s own pieces it leaves hanging; and any fork it creates. The position\'s own hanging pieces and favorable captures come back once at the top. Use it every single time you are about to name a move that you have not just read in a tool result or in the game itself — a move that is not legal, or a piece that is not there, costs you the student\'s trust for the rest of the session. It answers whether a move EXISTS and what it touches; how GOOD it is is get_engine_analysis\'s job.'
  },
  {
    name: 'annotate_board',
    description:
      'Draw arrows/highlights whenever you explain something with a shape on the board — a piece route, a weak square, a pin, a plan — not only when words alone would be ambiguous; this is your default way to show an idea. Keep one idea per call; call it again for the next idea. Cleared automatically on the next show_position.'
  },
  {
    name: 'expect_move',
    description:
      "Call this right before asking a single 'what would you play here?' question, when you expect exactly one move as the answer — the student's next board move is sent to you immediately instead of them building a longer line first. Clears itself after that one move — call it again next time you want the same instant behavior."
  },
  {
    name: 'hypothetical_line',
    description:
      'Set up or continue a diverged line off the CURRENT position (call show_position first if you have not already) — e.g. "if Black had played a4 instead". Pass the SAN move(s); the client validates them against real chess rules and reports back the resulting position, including its "resultFen" — never invent a resulting fen yourself. A hypothetical position is not part of the game, so nothing analyzes it for you: pass that resultFen to get_engine_analysis (how good it is) or check_moves (what is legal in it) before you judge it. Pass further moves to keep extending a line already in progress. This never touches the real game or its move list.'
  },
  {
    name: 'get_engine_analysis',
    description:
      "Runs the engine on a position and returns a curated summary: the best move with eval and principal variation, the other options considered, and any hanging pieces, forks, or favorable captures. The CURRENT position already has this under '## Current position' — never spend a call re-fetching it. Use it for OTHER positions: inside a hypothetical line (pass hypothetical_line's resultFen — a diverged line is the one case nothing analyzes for you), a candidate line, or an earlier/later move you are comparing against without moving to it (get its fen from check_position first). If you are actually turning to that move to discuss it, use show_position instead — that brings you the same analysis for free. Pass a fen you got from a tool, never one you reconstructed. At most 2 calls per reply, so pick the moments that matter and lean on your preparation notes for the rest."
  },
  {
    name: 'get_user_profile',
    description:
      'Read the student\'s focus areas, recent findings, and session history — call it whenever a mistake or idea feels like ground you may have covered before, even if the student hasn\'t asked; the summary above only shows recent items, so check here before repeating an explanation or homework you might have already given.'
  },
  {
    name: 'get_diagnostic_profile',
    description:
      'Read the student\'s measured diagnostic profile for THIS time control — up to three code-level diagnoses, each with how often the skill failed out of its opportunities, confidence, severity, scope, and whether the matching control skill is intact. This is harder evidence than get_user_profile\'s free-text findings. Call it when you are choosing what the session is FOR, not mid-explanation. A diagnosis flagged with failed data-quality gates is unreliable — name the caveat if you use it anyway, and prefer one without a flag when the choice is close. "No confident diagnoses yet" is a normal answer, not a failure.'
  },
  {
    name: 'get_player_stats',
    description:
      'Compare THIS game against the student\'s own record at this time control: accuracy, opening/tactics/strategy/endgame scores, blunders and missed wins per game, and which tactics the engine says were available this game versus their usual rate. Call it once when you are deciding what the session is FOR, alongside get_diagnostic_profile. The comparison is the point: a weak number that matches their usual is just them and is not today\'s lesson, while a number well out of line with their own baseline is worth building the session around. It tells you plainly when there is no baseline yet.'
  },
  {
    name: 'record_finding',
    description:
      'Record a durable observation about the student\'s thinking or habits — a mistake pattern (isPositive: false) or clear improvement (isPositive: true). One specific sentence, written as a coach\'s note about their thinking, not about the position. Record 3–8 per session, as they happen, not all at the end. When you can, name the diagnosis code, mechanism and direction — this comes from what the student actually told you, not a separate judgment call: "I never looked at that move" is a candidate-generation gap (mechanism G), "I saw it but thought it lost material" is calculation or judgment (C or J), "I knew that last week and blanked" is memory/retrieval (M), "I always miss this when my clock is low" is state-conditioned (S). direction is O (cannot use the idea), D (cannot detect/prevent it against them), B (both), or N (not applicable). Only set diagnosisCode when it names the specific catalog skill (e.g. TA-07 for knight forks, never a bare category) — leave all three out rather than guess.'
  },
  {
    name: 'propose_focus_area_update',
    description:
      "Record progress, a regression, or resolution on one of the student's CURRENT focus areas (listed above with their diagnosis code, e.g. \"TA-07\"), based on real evidence from this session. Address it by diagnosisCode. You do not create focus areas — the system selects them from measured evidence, not from a session impression. If you see a pattern that isn't a focus area yet, record it with record_finding and let the measurement catch up."
  },
  {
    name: 'update_threads',
    description:
      'Backstage conversation ledger (see "Conversation threading") — full replace, always pass the complete current list, never seen by the student. Call it the moment one of these happens, not in a batch later: (1) you set a topic aside to finish the current one; (2) you return to a parked topic (mark it active); (3) a topic gets resolved in conversation (mark it resolved or drop it); (4) you form a hypothesis about the student\'s thinking you want to test over the next few moments; (5) you decide on a goal or plan to come back to later — a goal for the rest of the session, or in play mode a multi-move idea you are steering toward. Ordinary back-and-forth on the current topic never touches the ledger. This is the most under-used tool you have: use it whenever one of those five actually happens, not only when it feels significant.'
  },
  {
    name: 'record_move_note',
    description:
      'Save a one-sentence note on a move you are leaving, for your own later reference (e.g. "missed Rxd5, discussed the pin, assigned as homework"). This is what a later conversation reads back as "Other moves discussed" instead of re-covering ground you already worked through together. If you leave a moment without calling it, the system folds a generic summary as a fallback — but that fallback cannot capture what you decided mattered, so treat calling this yourself as the default every time you move on from a moment. Addressed like show_position/check_position ({ moveNumber, color }) — never a bare ply.'
  },
  {
    name: 'recall_move',
    description:
      'Look up more detail on a specific earlier move in THIS session than the one-line summary in "Other moves discussed" gives you — call it when that summary is not enough to answer the student. Addressed like show_position/check_position ({ moveNumber, color }) — never a bare ply.'
  },
  {
    name: 'investigate_position',
    description:
      "Hand an open-ended question that needs OTHER positions checked — candidate replies, a few plies of a line, a sibling variation, a position that never happened — to a sub-agent that investigates on its own and returns one short, engine-grounded answer. Use it when answering well needs more than the position in front of you: 'does Black have a defense to this plan a few moves out?', 'is this candidate sound, or does it hang something two moves later?', 'compare these two replies.' Do NOT use it for something check_moves or one get_engine_analysis call already answers — those are free/cheap; this runs its own multi-step investigation and is tightly budgeted, so fold related sub-questions into one call. Pass a fen from show_position/check_position/hypothetical_line, never one you reconstructed; optionally pass moves (SAN) to start from a line applied on top of it. You get back a short answer only — none of its lookups reach your context."
  },
  {
    name: 'end_session',
    description:
      'Mark the session complete and trigger the post-session summary — call it when the walkthrough is done and you have wrapped up. Include a 2–3 sentence summary in the student\'s own words and one concrete homework task tied to the goal you actually worked on. Before calling it, check your thread ledger: every open or parked thread must be resolved or deliberately let go (it is fine to close one briefly: "we did not finish the h3 line — it is in your homework").'
  }
];

export function coachToolDescription(name: string): string {
  const spec = COACH_TOOL_SPECS.find((s) => s.name === name);
  if (!spec) throw new Error(`no description registered for tool "${name}"`);
  return spec.description;
}
