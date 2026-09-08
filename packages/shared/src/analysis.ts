import { z } from 'zod';
import { TacticMotifTypeSchema } from './tactic-motif.js';

export const AnalysisStatusSchema = z.enum([
  'queued',
  'engine_running',
  'planning',
  'ready',
  'failed'
]);
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

/** Queueing priority for the engine service's shared EnginePool (services/
 * engine/src/engine-pool.ts): 'interactive' jumps a freed engine ahead of any
 * already-waiting 'background' request. Exists because a bot's live move
 * selection and a background batch job (import analysis, deepen-analysis)
 * can land on the pool at the same time — without this, a bot move queues
 * FIFO behind whatever background work got there first and can time out,
 * stranding the game (see commitBotTurn's botPending path). Defaults to
 * 'background' when omitted, so every existing caller keeps its old FIFO
 * behavior unless it deliberately opts in. */
export const EnginePrioritySchema = z.enum(['interactive', 'background']);
export type EnginePriority = z.infer<typeof EnginePrioritySchema>;

export const EngineLineSchema = z.object({
  moveUci: z.string(),
  moveSan: z.string(),
  cp: z.number().int().nullable(),
  mateIn: z.number().int().nullable(),
  /** The line's full principal variation, when the caller captured it — the
   * batch engine call computes this in the same search as everything else on
   * this line (see services/engine/src/analyze.ts's analyzePosition), so
   * it's free to keep. Optional and additive: pre-existing stored evals
   * simply lack it. */
  pvSan: z.array(z.string()).optional()
});
export type EngineLine = z.infer<typeof EngineLineSchema>;

export const EngineEvalSchema = z.object({
  ply: z.number().int().nonnegative(),
  fen: z.string(),
  depth: z.number().int().positive(),
  // Deliberately NOT .min(1): a terminal position (checkmate or stalemate) has
  // no legal moves, so the engine returns zero lines for it — every game that
  // ends in mate has exactly this shape at its final ply. The native backend
  // returns its evals unvalidated and has always stored `lines: []` there
  // happily, so requiring a line only ever broke the browser backend, which is
  // the one path that parses through this schema
  // (services/engine/browser-tunnel-engine-backend.ts).
  lines: z.array(EngineLineSchema)
});
export type EngineEval = z.infer<typeof EngineEvalSchema>;

export const MOVE_QUALITIES = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
  'forced'
] as const;
export type MoveQuality = (typeof MOVE_QUALITIES)[number];
/** The algorithm specification calls this value a Classification. The
 * existing API uses `quality`, so keep both names conceptually aligned until
 * the classifier migration is complete. */
export type Classification = MoveQuality;

/** Chess.com/lichess-style NAG symbols for each quality tier. */
export const MOVE_QUALITY_SYMBOLS: Record<MoveQuality, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '!',
  book: '📖',
  inaccuracy: '?!',
  mistake: '?',
  miss: '✕',
  blunder: '??',
  forced: '→'
};

export const MoveQualitySchema = z.enum(MOVE_QUALITIES);
export const ClassificationSchema = MoveQualitySchema;

export const AnalyzeGameRequestSchema = z.object({
  fens: z.array(z.string()).min(1),
  depth: z.number().int().positive().optional(),
  multiPv: z.number().int().positive().optional(),
  priority: EnginePrioritySchema.optional()
});
export type AnalyzeGameRequest = z.infer<typeof AnalyzeGameRequestSchema>;

export const AnalyzePositionRequestSchema = z.object({
  fen: z.string(),
  depth: z.number().int().positive().optional(),
  multiPv: z.number().int().positive().optional(),
  priority: EnginePrioritySchema.optional()
});
export type AnalyzePositionRequest = z.infer<typeof AnalyzePositionRequestSchema>;

/** The bot session's hint feature ("top 3 moves"), fetched once when the
 * student first opens a hint — POST /api/positions/hint-moves. Deliberately
 * its own endpoint rather than
 * reusing /api/positions/analyze: that one always runs through
 * CachingEngineBackend, whose position_evaluations cache is keyed by `fen`
 * alone (no depth/multiPv discrimination — see ENGINE_DEFAULT_DEPTH's doc
 * comment), so a request-supplied multiPv there would silently poison the
 * standard-depth cache other callers share. This one runs uncached, at a
 * fixed hint-appropriate depth/multiPv the server controls, the same way
 * the bot's own move selection does (resolveRawEngineBackend). */
export const HintMovesRequestSchema = z.object({ fen: z.string() });
export type HintMovesRequest = z.infer<typeof HintMovesRequestSchema>;

export const HintMovesResponseSchema = z.object({ lines: z.array(EngineLineSchema) });
export type HintMovesResponse = z.infer<typeof HintMovesResponseSchema>;

/**
 * Rich, single-position analysis (interactive path only — see
 * PositionAnalysisSchema below). Deliberately separate from
 * EngineEval/EngineLine above, which stay lean and unchanged: those still
 * back the whole-game batch pipeline (classifyMoves, DB storage), and this
 * type must never leak extra compute/storage cost onto that path.
 */
export const PieceSymbolSchema = z.enum(['p', 'n', 'b', 'r', 'q', 'k']);
export type PieceSymbolDto = z.infer<typeof PieceSymbolSchema>;

export const MoveFlagsSchema = z.object({
  isCapture: z.boolean(),
  isCheck: z.boolean(),
  isCheckmate: z.boolean(),
  isPromotion: z.boolean(),
  isCastle: z.boolean(),
  movedPieceType: PieceSymbolSchema,
  capturedPieceType: PieceSymbolSchema.nullable(),
  legalMoveCount: z.number().int().nonnegative()
});
export type MoveFlagsDto = z.infer<typeof MoveFlagsSchema>;

const ColorSchema = z.enum(['white', 'black']);
const PerColorCountSchema = z.object({ white: z.number().int().nonnegative(), black: z.number().int().nonnegative() });

export const PositionAnalysisLineSchema = z.object({
  moveUci: z.string(),
  moveSan: z.string(),
  /** Full principal variation in SAN, this move included — unlike
   * EngineLine, which (for the batch path) only keeps the first move. */
  pvSan: z.array(z.string()),
  cp: z.number().int().nullable(),
  mateIn: z.number().int().nullable()
});
export type PositionAnalysisLine = z.infer<typeof PositionAnalysisLineSchema>;

export const AttackedPieceSchema = z.object({
  square: z.string(),
  piece: PieceSymbolSchema,
  color: ColorSchema,
  attackers: z.number().int().nonnegative(),
  defenders: z.number().int().nonnegative()
});
export type AttackedPieceDto = z.infer<typeof AttackedPieceSchema>;

export const OverloadedDefenderSchema = z.object({
  square: z.string(),
  defending: z.array(z.string())
});

export const ControlledSquaresSchema = z.object({
  square: z.string(),
  piece: PieceSymbolSchema,
  color: ColorSchema,
  squares: z.array(z.string())
});

export const SemiOpenFileSchema = z.object({
  file: z.string(),
  /** The color with no pawns on this file — the side it's open *for*. */
  openFor: ColorSchema
});

export const DoubledPawnFileSchema = z.object({
  file: z.string(),
  color: ColorSchema,
  count: z.number().int().min(2)
});

export const PawnInfoSchema = z.object({
  square: z.string(),
  color: ColorSchema
});

export const TargetsAttackedSchema = z.object({
  from: z.string(),
  piece: PieceSymbolSchema,
  targets: z.array(z.string())
});

export const ForkSchema = z.object({
  square: z.string(),
  piece: PieceSymbolSchema,
  forkedSquares: z.array(z.string())
});

export const CaptureOpportunitySchema = z.object({
  moveSan: z.string(),
  from: z.string(),
  to: z.string(),
  capturedPiece: PieceSymbolSchema,
  favorable: z.boolean()
});

export const CheckOpportunitySchema = z.object({
  moveSan: z.string(),
  from: z.string(),
  to: z.string(),
  isCheckmate: z.boolean()
});
export type CheckOpportunityDto = z.infer<typeof CheckOpportunitySchema>;

export const ThreatOpportunitySchema = z.object({
  moveSan: z.string(),
  from: z.string(),
  to: z.string(),
  targetedPieces: z.array(AttackedPieceSchema)
});
export type ThreatOpportunityDto = z.infer<typeof ThreatOpportunitySchema>;

/** The engine-independent CCT (checks, captures, threats) options available
 * before a move. Each group keeps an explicit `available` flag so consumers
 * do not need to infer semantics from an array. Threats are raw newly-attacked
 * opponent pieces, deliberately independent from named motif classification. */
export const ChecksCapturesThreatsSchema = z.object({
  checks: z.object({ available: z.boolean(), moves: z.array(CheckOpportunitySchema) }),
  captures: z.object({ available: z.boolean(), moves: z.array(CaptureOpportunitySchema) }),
  threats: z.object({ available: z.boolean(), moves: z.array(ThreatOpportunitySchema) })
});
export type ChecksCapturesThreats = z.infer<typeof ChecksCapturesThreatsSchema>;

/** Static, engine-independent board features — pure function of a FEN (see
 * packages/chess-analysis's computePositionFeatures). */
export const PositionFeaturesSchema = z.object({
  turn: ColorSchema,
  boardState: z.enum(['none', 'check', 'checkmate', 'stalemate']),
  availableMoves: z.array(z.string()),
  mobility: PerColorCountSchema,
  controlledSquares: z.array(ControlledSquaresSchema),
  piecesUnderAttack: z.array(AttackedPieceSchema),
  hangingPieces: z.array(AttackedPieceSchema),
  underDefendedPieces: z.array(AttackedPieceSchema),
  overloadedDefenders: z.array(OverloadedDefenderSchema),
  centerControlScore: PerColorCountSchema,
  openFiles: z.array(z.string()),
  semiOpenFiles: z.array(SemiOpenFileSchema),
  doubledPawns: z.array(DoubledPawnFileSchema),
  isolatedPawns: z.array(PawnInfoSchema),
  passedPawns: z.array(PawnInfoSchema),
  targetsAttacked: z.array(TargetsAttackedSchema),
  forks: z.array(ForkSchema),
  captureOpportunities: z.array(CaptureOpportunitySchema)
});
export type PositionFeatures = z.infer<typeof PositionFeaturesSchema>;

export const FeatureDeltaSchema = z.object({
  newForks: z.array(ForkSchema),
  newHangingPieces: z.array(AttackedPieceSchema),
  mobilityDelta: z.number().int()
});
export type FeatureDeltaDto = z.infer<typeof FeatureDeltaSchema>;

export const MovePhaseSchema = z.enum(['opening', 'middlegame', 'endgame']);
export type MovePhase = z.infer<typeof MovePhaseSchema>;

export const AlternativeMoveSchema = z.object({
  san: z.string(),
  cp: z.number(),
  winPct: z.number().min(0).max(100)
});
export type AlternativeMove = z.infer<typeof AlternativeMoveSchema>;

/** Board geometry behind a tactic hit (tacticHitVisual in chess-analysis) —
 * an arrow per square-to-square relationship the motif involves, plus any
 * square worth highlighting on its own (e.g. a trapped piece has no arrow,
 * just a highlight). Lets the Game Review UI draw the tactic on the board
 * instead of only naming it in `detail`. */
export const TacticArrowSchema = z.object({ from: z.string(), to: z.string() });
export const TacticVisualSchema = z.object({
  arrows: z.array(TacticArrowSchema),
  highlights: z.array(z.string())
});
export type TacticVisualDto = z.infer<typeof TacticVisualSchema>;

/** A legacy classified move extended with the report fields from algorith.md
 * §9. The report fields are optional during this migration so analyses stored
 * before the report pipeline and live-play rows remain readable. `quality` is
 * the existing API name for the report's `classification`; `moveSan` and
 * `bestLineSan` likewise preserve the existing API names for `san` and the
 * first-move-only legacy PV. */
export const ClassifiedMoveSchema = z.object({
  ply: z.number().int().nonnegative(),
  moveNumber: z.number().int().positive().optional(),
  moveSan: z.string(),
  uci: z.string().optional(),
  mover: z.enum(['white', 'black']),
  isUserMove: z.boolean(),
  cpLoss: z.number().int().nonnegative(),
  quality: MoveQualitySchema,
  bestLineSan: z.array(z.string()),
  evalAfterCp: z.number().int(),
  hangsPiece: z.boolean().default(false),
  fenBefore: z.string().optional(),
  fenAfter: z.string().optional(),
  cpBefore: z.number().int().optional(),
  cpAfter: z.number().int().optional(),
  winPctBefore: z.number().min(0).max(100).optional(),
  winPctAfter: z.number().min(0).max(100).optional(),
  drop: z.number().min(0).max(100).optional(),
  accuracy: z.number().min(0).max(100).optional(),
  underlyingSeverity: MoveQualitySchema.optional(),
  phase: MovePhaseSchema.optional(),
  isTacticalPosition: z.boolean().optional(),
  bestMoveSan: z.string().optional(),
  bestLinePvSan: z.array(z.string()).optional(),
  alternatives: z.array(AlternativeMoveSchema).optional(),
  reasons: z.array(z.string()).optional(),
  features: PositionFeaturesSchema.optional(),
  moveFlags: MoveFlagsSchema.optional(),
  featureDelta: FeatureDeltaSchema.optional(),
  /** Engine-independent CCT options available before this move. Optional for
   * compatibility with classified moves persisted before this calculation
   * was introduced. */
  checksCapturesThreats: ChecksCapturesThreatsSchema.optional(),
  /** The engine's top move at this position embodied this tactic — did the
   * player play it (see computeTacticMotifCounts). Undefined when the
   * position wasn't a named-motif opportunity at all, not just a 0/1.
   * `detail` (describeTacticHit) names the concrete piece/square involved —
   * `.optional()` (not required alongside `type`/`found`) so a report stored
   * before `detail` existed still parses; absent, not null, is "not
   * computed" there, same jsonb-no-migration convention as everywhere else
   * on this schema. `.nullable()` covers describeTacticHit's own "no
   * detector-specific shape for this type" case. */
  tacticOpportunity: z
    .object({
      type: TacticMotifTypeSchema,
      found: z.boolean(),
      detail: z.string().nullable().optional(),
      /** Same absent-not-null convention as `detail` — undefined on a
       * report stored before `visual` existed, `null` when the motif type
       * has no detector-specific geometry to draw. */
      visual: TacticVisualSchema.nullable().optional()
    })
    .optional(),
  /** The opponent had this tactic reachable right before this move — did the
   * player's move defuse it (see computeTacticMotifPrevented). When the scan
   * finds more than one reachable motif type, this names only the
   * highest-priority one (registry.ts's precedence order) — the per-game
   * `tacticMotifs.preventable`/`.prevented` counts remain the source of
   * truth for "how many", this is only "what to show on this one move".
   * `detail` follows the same convention as `tacticOpportunity.detail`. */
  tacticPrevention: z
    .object({
      type: TacticMotifTypeSchema,
      prevented: z.boolean(),
      detail: z.string().nullable().optional(),
      visual: TacticVisualSchema.nullable().optional()
    })
    .optional()
});
export type ClassifiedMoveDto = z.infer<typeof ClassifiedMoveSchema>;
export type MoveReport = ClassifiedMoveDto;

export const PositionAnalysisSchema = z.object({
  fen: z.string(),
  depth: z.number().int().positive(),
  multiPv: z.number().int().positive(),
  bestMove: z.string().nullable(),
  eval: z.object({ cp: z.number().int().nullable(), mateIn: z.number().int().nullable() }),
  lines: z.array(PositionAnalysisLineSchema),
  /** turn/boardState live here, not duplicated at the top level. */
  features: PositionFeaturesSchema
});
export type PositionAnalysis = z.infer<typeof PositionAnalysisSchema>;
