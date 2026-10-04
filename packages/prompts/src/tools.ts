import { z } from 'zod';
import { DIAGNOSIS_CODE_PUZZLE_THEMES, MAX_HABIT_NOTE_CHARS, MAX_LESSON_NOTE_CHARS, MAX_STUDENT_MEMORY_CHARS } from '@freechesscoach/chess-analysis';
import { DiagnosisCodeIdSchema, FindingSchema, FocusAreaUpdateSchema, ThreadSchema, type CoachPhase, type SessionMode } from '@freechesscoach/shared';

/** architecture §7.1 — parameter schemas for the coach agent's 18 tools. Pure
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

/** Only the catalog codes that have practice material behind them
 * (chess-analysis's theme map) — every other code can only ever come back
 * assigned: false, and a model offered the whole catalog picked those
 * (TA-34), then told the student a set was waiting on their dashboard. */
const ASSIGNABLE_DIAGNOSIS_CODES = Object.keys(DIAGNOSIS_CODE_PUZZLE_THEMES) as [string, ...string[]];

/** Task 66.2 — addressed by diagnosisCode alone, same catalog-anchored
 * discipline as everything else that names one (never free text). */
export const assignFocusedSessionParameters = z.object({
  diagnosisCode: z.enum(ASSIGNABLE_DIAGNOSIS_CODES)
});

export const updateThreadsParameters = z.object({
  threads: z.array(ThreadSchema)
});

/** No arguments, like show_position's cousins that only signal: the browser
 * acknowledges it and the server moves the session into the review. */
export const beginReviewParameters = z.object({});

/** The same shape for the way out of the review into the closing progress round. */
export const beginWrapUpParameters = z.object({});

/** A short, general observation left during the review for the closing round
 * to read. Addressed by diagnosisCode when it is about one of the habits. */
export const noteProgressParameters = z.object({
  diagnosisCode: DiagnosisCodeIdSchema.nullable(),
  note: z.string().min(1).max(MAX_HABIT_NOTE_CHARS)
});

/** The closing round's durable notes. Both are checked for being general
 * (chess-analysis's `checkGeneralNote`) before anything is stored. */
export const saveProgressNotesParameters = z.object({
  studentMemory: z.string().min(1).max(MAX_STUDENT_MEMORY_CHARS),
  lessonNote: z.string().min(1).max(MAX_LESSON_NOTE_CHARS)
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
 * position by default — e.g. "if Black had played a4 instead". Starting a
 * FRESH line (none active yet) may instead pass `base`, a { moveNumber,
 * color } address exactly like show_position's: the common case this
 * exists for is proposing the move that should have replaced the one
 * actually played at the moment on screen, but that moment's own position
 * is already AFTER the move (show_position always reveals the final
 * position for a move, never a pre-move one) — so without `base`, the
 * alternative move gets applied to the wrong side to move. `base` should
 * name the position one ply earlier (the position right before that move)
 * so it lands on the side who actually had the choice. With a line already
 * active, `moves` alone extends it (a continuing hypothetical may be several
 * moves past any real-game move at all); `newLine: true` — or passing
 * `base` — discards it and starts a fresh one instead, so the coach can
 * show a second, separate line without first returning to the real game. */
export const hypotheticalLineParameters = z.object({
  moves: z.array(z.string().min(1)).min(1).max(12),
  base: z
    .object(moveAddressShape)
    .refine(refineMoveAddress, { message: MOVE_ADDRESS_REFINEMENT_MESSAGE })
    .optional(),
  newLine: z.boolean().optional()
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
      'Look up the fen and SAN for any move in THIS game without moving the student\'s board, addressed exactly like show_position ({ moveNumber, color }; the game start is { moveNumber: 0, color: null }). Use it to get a verified fen for a moment other than the one on screen, or to confirm a move exists at all before you refer to it. The fen of the move on screen, and of the position before it, is already in "## Current position" — never look those up. Free and unbudgeted. NEVER invent or reconstruct a fen, and never refer to a move you have not confirmed exists.'
  },
  {
    name: 'check_moves',
    description:
      'Check whether one or two specific moves are legal in ONE position, and what they actually do — pure board reading, no engine, free and unbudgeted. Pass a fen you got from a tool result or from "## Current position" plus up to 6 moves in SAN. For each one you get back: legal or NOT legal (and, when not, what that piece can really do here); what it captures, whether it gives check or mate; the fen it reaches; what else it does on the board (attacks, pins, forks); and which of the mover\'s own pieces it leaves loose, meaning the other side can win them. The position\'s own loose pieces and favorable captures come back once at the top. It is for a quick "does this move exist and what does it touch" on a move that is NOT in your context. Never use it for a move that is in "## Current position", in an engine line, in the review, or in an earlier tool result this reply, never repeat a call, and never walk a line move by move with it — a line of two or more moves goes in ONE hypothetical_line call, which checks every move and reports what each does. A move that is not legal, or a piece that is not there, costs you the student\'s trust for the rest of the session. It answers whether a move EXISTS and what it touches; how GOOD it is is the engine\'s job.'
  },
  {
    name: 'annotate_board',
    description:
      'Draw arrows/highlights when you explain something with a shape on the board — a piece route, a weak square, a pin, a plan. Never draw the answer to a question you\'ve just asked the student: while a question is open, an arrow or highlight may only be part of the question itself (the piece or squares you\'re asking about); show the answer only after they\'ve given it, or when you\'re explaining rather than asking. Keep one idea per call; call it again for the next idea. Cleared automatically on the next show_position.'
  },
  {
    name: 'expect_move',
    description:
      "Call this right before asking a single 'what would you play here?' question, when you expect exactly one move as the answer — the student's next board move is sent to you immediately instead of them building a longer line first. In a finished game, use it only for a genuine exercise on the position BEFORE the move that was played (the board's current position is already after it) — never to ask what they 'would' play when they already played it. Clears itself after that one move — call it again next time you want the same instant behavior."
  },
  {
    name: 'hypothetical_line',
    description:
      'Set up or continue a diverged line — e.g. "if Black had played a4 instead" — and read the whole line back in one call. Pass the SAN moves of the WHOLE line you want to examine (up to 12), not one move at a time. The client plays them through real chess rules and the result gives you: each move played (the first illegal one is named, and the moves before it still stand), the "resultFen", and — computed for you — lineFacts (what each move captures, checks, attacks and leaves loose), the end position\'s board facts, and the engine\'s verdict on the end position (best move, eval, line). Read the verdict from that result: the line is already checked and analyzed, so do not follow it with check_moves or get_engine_analysis on the same position. This is also the way to test a line the student proposes or one you are not sure of: open it here, once, then answer from what comes back. Starting a FRESH line branches off the CURRENT position by default. To propose the move that should have replaced the one actually played at the moment on screen, pass base: { moveNumber, color } for the position ONE PLY BEFORE that move (addressed exactly like show_position) instead — the moment itself is already the position AFTER the move, so starting there hands your alternative to the wrong side to move. While a line is open, moves alone EXTEND it from its last move (the result says continuedLine: true); to show a different, separate line instead, pass newLine: true (plus base if it branches from before the move on screen) — that replaces the open line, no need to return to the real game first. Never invent a resulting fen yourself. This never touches the real game or its move list.'
  },
  {
    name: 'get_engine_analysis',
    description:
      "Runs the engine on a position and returns a curated summary: the best move with eval and principal variation, the other options considered, and any hanging pieces, forks, or favorable captures. The CURRENT position already has this under '## Current position' — never spend a call re-fetching it. Use it for OTHER positions: one no hypothetical_line has reached, or an earlier/later move you are comparing against without moving to it (get its fen from check_position first). A hypothetical_line result already carries the engine's verdict on its end position — never fetch that again. If you are actually turning to that move to discuss it, use show_position instead — that brings you the same analysis for free. Pass a fen you got from a tool, never one you reconstructed. At most 2 calls per reply, so pick the moments that matter and lean on your preparation notes for the rest."
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
      'Record a durable observation about the student\'s thinking or habits — a mistake pattern (isPositive: false) or clear improvement (isPositive: true). One specific sentence, written as a coach\'s note about their thinking, not about the position. Record 3–8 per session, as they happen, not all at the end. Check the diagnosis-codes list for this student before deciding: name the code only if the problem you observed this session matches that entry\'s description exactly — compare the closest entries, never default to the student\'s known focus areas, and never pick a neighbouring code because it is close; this comes from what the student actually told you or did, not a separate judgment call, so look for a specific catalog skill that actually matches (e.g. TA-07 for knight forks, never a bare category) rather than defaulting to skipping it. When one genuinely fits, name the diagnosis code, mechanism and direction together: "I never looked at that move" is a candidate-generation gap (mechanism G), "I saw it but thought it lost material" is calculation or judgment (C or J), "I knew that last week and blanked" is memory/retrieval (M), "I always miss this when my clock is low" is state-conditioned (S). direction is O (cannot use the idea), D (cannot detect/prevent it against them), B (both), or N (not applicable). Genuinely none of them fit is a normal, correct answer too — leave all three out rather than force a fit that isn\'t really there.'
  },
  {
    name: 'propose_focus_area_update',
    description:
      "Change where one of the student's focus areas stands, based on real evidence — address it by diagnosisCode. Actions: \"progress\" (it is getting better: active → improving), \"regress\" (it came back: improving → active), \"graduate\" (consistently handled across sessions: it leaves the list of three and goes on the improved list, which frees the slot), \"reopen\" (a graduated habit failed again: it comes back as active, and needs a free slot — graduate one first, or mark one improving, when three are active), and \"create\" (real, specific evidence for a catalog code that is not tracked yet — you saw the pattern and can point to the moment; it never duplicates, and a create on a tracked area folds into progress, or reopen for a graduated one). The note is your standing view of this habit, rewritten each time: general, about how the student thinks, never about one move — no move numbers, no moves, no squares (a note that names one is refused and nothing changes; write the habit in words). The result says whether it was applied and, when not, why — say so honestly rather than announcing a change that did not happen. When you are not sure it is specific enough to be its own focus area, record_finding and let the measurement catch up instead."
  },
  {
    name: 'assign_focused_session',
    description:
      "When a diagnosed weakness comes up in conversation and is worth deliberate practice beyond what you can do together right now, assign a focused practice set targeting that specific catalog diagnosisCode — it appears on the student's dashboard to work through on their own; mention it naturally rather than announcing a feature (\"I'm setting you up with some positions on this\" not \"I have created a focused session assignment\"). Usable at any point in the session, not only at the close. When the student asks for puzzles, practice or exercises, this IS that tool — call it right away rather than deferring or saying you can't: use the code of the weakness you are working on, else the top diagnosis from get_diagnostic_profile. The set is made of puzzles; you may call them that, but it is a focused set on one skill, not random puzzles. Check the result before saying anything: assigned: false means no practice material is available for that skill yet, so say so honestly instead of promising something that didn't happen; assigned: true with reason \"already assigned, not duplicated\" means one was already open for this code, so point the student at what's already there rather than announcing a new one. Only the listed codes have practice material: if the skill you have in mind isn't among them, pick the closest listed code and say which skill the set trains. An earlier assigned: false in this conversation doesn't carry over — when asked again, call the tool again rather than repeating the old answer."
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
    name: 'note_progress',
    description:
      'Leave yourself a short note for the closing progress round, while the review is going: one general observation about how the student handles a habit you are working on — seen or missed in the moment, cued or unprompted. Pass the diagnosisCode when it is about one of their focus areas (null otherwise). Write the habit, never the move: no move numbers, no moves, no squares (a note that names one is refused). Not every moment needs one; leave one when you saw something you would want to remember when you write the student\'s progress down. You will read them back as "## Progress notes for this game".'
  },
  {
    name: 'begin_wrap_up',
    description:
      'Call this when the last moment has been discussed and the student has said what they think the lesson was — it ends the game review and starts the closing progress round, where you update their focus areas and notes, tell them what moved and close the session. Say a short, natural line to the student first. Nothing after this call belongs to the game; the next thing you do is the progress round.'
  },
  {
    name: 'begin_review',
    description:
      'Call this when the progress check-in is done — you have updated what changed, told the student, and heard their reply — to start the game review. Say a short, natural line first ("Now, to the game."). Nothing after this call belongs to the check-in.'
  },
  {
    name: 'save_progress_notes',
    description:
      'Write down what you know about this student, for every later session. studentMemory is your one long-term text about them — how they think, what they tend to miss, what teaches them best, what is settled — rewritten WHOLE each time (keep what is still true, change what is not; at most 1,500 characters). lessonNote is this session in a few sentences: what you worked on, how it went, what to do next time. Both are general: about habits and how they learn, never about one move — no move numbers, no moves, no squares (a note that names one is refused and nothing is stored; rewrite it). Call it in the closing round, after you have updated the focus areas and before end_session.'
  },
  {
    name: 'investigate_position',
    description:
      "Hand an open-ended question that needs OTHER positions checked — candidate replies, a few plies of a line, a sibling variation, a position that never happened — to a sub-agent that investigates on its own and returns one short, engine-grounded answer. Use it when answering well needs more than the position in front of you: 'does Black have a defense to this plan a few moves out?', 'is this candidate sound, or does it hang something two moves later?', 'compare these two replies.' Do NOT use it for something check_moves or one get_engine_analysis call already answers — those are free/cheap; this runs its own multi-step investigation and is tightly budgeted, so fold related sub-questions into one call. Pass a fen from show_position/check_position/hypothetical_line, never one you reconstructed; optionally pass moves (SAN) to start from a line applied on top of it. You get back a short answer only — none of its lookups reach your context."
  },
  {
    name: 'end_session',
    description:
      'Mark the session complete — call it as the last step, when everything is said. Include a 2–3 sentence summary addressed to the student and one concrete homework task tied to the goal you actually worked on (null if there is none): both are shown on their dashboard. In a coaching session you call it in the closing progress round, after save_progress_notes. Before calling it, check your thread ledger: every open or parked thread must be resolved or deliberately let go (it is fine to close one briefly: "we did not finish the h3 line — it is in your homework").'
  }
];

const PROGRESS_ONLY_TOOLS: readonly string[] = ['note_progress', 'begin_wrap_up', 'begin_review', 'save_progress_notes'];

/** The tools of each round of a coaching session. The two progress rounds are
 * short and only touch the student's progress; the review has everything but
 * the way to end the session, which belongs to the closing round. */
const PHASE_TOOL_NAMES: Record<CoachPhase, readonly string[] | 'all-but-closing'> = {
  progress_open: ['get_user_profile', 'get_diagnostic_profile', 'get_player_stats', 'propose_focus_area_update', 'update_threads', 'begin_review'],
  review: 'all-but-closing',
  progress_close: [
    'get_user_profile',
    'get_diagnostic_profile',
    'get_player_stats',
    'propose_focus_area_update',
    'assign_focused_session',
    'update_threads',
    'save_progress_notes',
    'end_session'
  ]
};

/** Not in the review: changing the list and ending the session belong to the
 * rounds, so the review collects evidence (note_progress) and leaves the rest. */
const NOT_IN_THE_REVIEW: readonly string[] = ['begin_review', 'save_progress_notes', 'end_session', 'propose_focus_area_update'];

/** The tool specs the coach has in `mode` during `phase`, in COACH_TOOL_SPECS
 * order. A play session has no progress rounds, so it keeps its own tools and
 * end_session and none of the progress ones. */
export function coachToolSpecsFor(mode: SessionMode, phase: CoachPhase, all: readonly CoachToolSpec[] = COACH_TOOL_SPECS): CoachToolSpec[] {
  if (mode !== 'analyze') return all.filter((spec) => !PROGRESS_ONLY_TOOLS.includes(spec.name));
  const names = PHASE_TOOL_NAMES[phase];
  if (names === 'all-but-closing') return all.filter((spec) => !NOT_IN_THE_REVIEW.includes(spec.name));
  return all.filter((spec) => names.includes(spec.name));
}

export function coachToolDescription(name: string): string {
  const spec = COACH_TOOL_SPECS.find((s) => s.name === name);
  if (!spec) throw new Error(`no description registered for tool "${name}"`);
  return spec.description;
}
