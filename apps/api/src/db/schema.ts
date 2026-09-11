import type { ColumnType, Generated } from 'kysely';
import type { GameSpeed, PgnMoveComment } from '@freechesscoach/chess-analysis';
import type { BotConfig, CoachPersona, DiagnosisCodeId, Direction, EngineMode, GameReviewTier, Mechanism, MistakeCategory, RatingBand, RatingSource, Severity, SessionMode, TtsBackend } from '@freechesscoach/shared';

/** jsonb columns: pg parses them to JS values on select; inserts/updates must pass a JSON string. */
type Jsonb<T> = ColumnType<T, string, string>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  displayName: string;
  ratingBand: Generated<RatingBand>;
  /** 0024_user_rating.ts — see packages/shared/src/user.ts's deriveRatingBand. */
  rating: number | null;
  ratingSource: RatingSource | null;
  engineMode: Generated<EngineMode>;
  coachPersona: Generated<CoachPersona>;
  lichessUsername: string | null;
  chesscomUsername: string | null;
  selfAssessment: string | null;
  ttsEnabled: Generated<boolean>;
  ttsBackend: Generated<TtsBackend>;
  createdAt: Generated<Date>;
}

export interface UserLlmKeysTable {
  userId: string;
  provider: 'anthropic' | 'openai';
  keyCiphertext: Buffer;
  keyIv: Buffer;
  createdAt: Generated<Date>;
}

export interface GamesTable {
  id: Generated<string>;
  userId: string;
  pgn: string;
  source: 'paste' | 'upload' | 'lichess' | 'coach_play' | 'vs_bot' | 'chesscom';
  userColor: 'white' | 'black';
  whiteName: string | null;
  blackName: string | null;
  result: string | null;
  timeControl: string | null;
  eco: string | null;
  playedAt: Date | null;
  createdAt: Generated<Date>;
  /** Set iff source === 'vs_bot' — the BOT_ROSTER id. */
  botId: string | null;
  /** Set iff source === 'vs_bot' — a frozen copy of the BotConfig at
   * game-start time, so a later roster edit never rewrites the story of an
   * already-played game. */
  botConfigSnapshot: Jsonb<BotConfig> | null;
  /** The chosen time control, frozen at game-start (null = untimed). See
   * 0021_bot_game_clock.ts — all four clock columns are null together. */
  clockInitialMs: number | null;
  clockIncrementMs: number | null;
  /** Live remaining time, updated after every committed move
   * (bot-move-commit.ts) and read by the claim-timeout endpoint. */
  whiteRemainingMs: number | null;
  blackRemainingMs: number | null;
  /** All below: 0023_game_metadata.ts, populated at import time from
   * parseGameHeaders/extractPgnMoveComments — see game-import.ts. */
  whiteElo: number | null;
  blackElo: number | null;
  ratingsProvisional: Generated<boolean>;
  rated: boolean | null;
  termination: string | null;
  variant: string | null;
  /** Persisted `classifyTimeControl(timeControl)`, so pooling by speed
   * (docs/diagnose.md §4.2) pushes into SQL instead of being recomputed on
   * every stats read. */
  speed: GameSpeed | null;
  /** `time` column — node-postgres returns/accepts "HH:MM:SS". */
  playedAtTime: string | null;
  moveTimes: Jsonb<PgnMoveComment[]> | null;
  /** 0031_game_review_tier.ts — which Games page tab this game belongs in.
   * Always set explicitly by the repository's `insert` (defaultReviewTierForSource),
   * same pattern as ratingsProvisional below; the column default only backfills
   * rows that predate the migration. */
  reviewTier: Generated<GameReviewTier>;
  /** 0032_annotated_pgn.ts — the canonical per-move analysis store: the same
   * mainline as `pgn`, with each analyzed ply's `ClassifiedMoveDto` (minus
   * what's already reconstructible by replay) embedded as a `[%fcc ...]`
   * comment tag (packages/chess-analysis/src/annotated-pgn.ts). Null until
   * the batch analysis job or a live-play move first writes it. Replaces
   * `game_move_qualities` and `analyses.classified_moves`. */
  annotatedPgn: string | null;
  /** The wall-clock time `annotatedPgn` was last appended to — live play's
   * replacement for `game_move_qualities.createdAt` (bot-move-commit.ts's
   * elapsed-time calc reads this directly off the game row instead of a
   * second query). Null for a game that has never had a move committed
   * through the live-play path. */
  lastMoveAt: Date | null;
}

export interface AnalysesTable {
  id: Generated<string>;
  gameId: string;
  status: 'queued' | 'engine_running' | 'planning' | 'ready' | 'failed';
  error: string | null;
  /** 0032_annotated_pgn.ts — replaces `engineEvals`, which was write-only
   * (persisted per chunk during `engine_running`, read back only via
   * `jsonb_array_length` for the progress bar — never for its content once
   * a game reaches `ready`). Incremented per chunk instead of growing a
   * jsonb array nothing re-reads. */
  evalsComputed: Generated<number>;
  coachingPlan: Jsonb<unknown> | null;
  bookReport: Jsonb<unknown> | null;
  /** 0032_annotated_pgn.ts — now `StoredGameReport` (GameReportSchema minus
   * `moves`, packages/shared), not a full `GameReport`: `moves` was a
   * confirmed duplicate of this same column's own `.moves` (both held the
   * identical `ClassifiedMoveDto[]`), so it now lives solely in
   * `games.annotatedPgn`. `services/game-report.ts`'s `getFullGameReport`
   * composes the two back into a full `GameReport` at read time. */
  gameReport: Jsonb<unknown> | null;
  createdAt: Generated<Date>;
  completedAt: Date | null;
}

export interface SessionsTable {
  id: Generated<string>;
  gameId: string;
  userId: string;
  status: 'active' | 'completed' | 'paused_no_credits' | 'abandoned';
  mode: Generated<SessionMode>;
  currentPly: Generated<number>;
  /** What the conversation is actually about — episode boundaries
   * (lib/episodes.ts) and session_messages.ply tagging key off this, not
   * currentPly. A flashback show_position moves currentPly (the board)
   * without moving this; a subject-change show_position moves both. */
  subjectPly: Generated<number>;
  threads: ColumnType<unknown, string | undefined, string>;
  debugSnapshot: ColumnType<unknown, string | null | undefined, string | null>;
  summary: string | null;
  homework: string | null;
  startedAt: Generated<Date>;
  endedAt: Date | null;
}

export interface SessionMessagesTable {
  id: Generated<string>;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool';
  content: Jsonb<unknown>;
  ply: number | null;
  createdAt: Generated<Date>;
}

export interface SessionMoveNotesTable {
  id: Generated<string>;
  sessionId: string;
  ply: number;
  note: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface FindingsTable {
  id: Generated<string>;
  userId: string;
  sessionId: string | null;
  gameId: string | null;
  category: MistakeCategory;
  severity: 'minor' | 'significant' | 'critical';
  ply: number | null;
  description: string;
  isPositive: Generated<boolean>;
  diagnosisCode: DiagnosisCodeId | null;
  mechanism: Mechanism | null;
  direction: Direction | null;
  createdAt: Generated<Date>;
}

export interface FocusAreasTable {
  id: Generated<string>;
  userId: string;
  category: MistakeCategory;
  diagnosisCode: DiagnosisCodeId | null;
  status: 'active' | 'improving' | 'resolved';
  note: string;
  evidenceCount: Generated<number>;
  lastSeenAt: Generated<Date>;
  createdAt: Generated<Date>;
}

export interface CreditLedgerTable {
  id: Generated<string>;
  userId: string;
  delta: number;
  reason: 'signup_grant' | 'purchase' | 'session_usage' | 'refund';
  sessionId: string | null;
  stripeEventId: string | null;
  createdAt: Generated<Date>;
}

export interface PositionEvaluationsTable {
  fen: string;
  depth: number;
  multiPv: number;
  analysis: Jsonb<unknown>;
  isExternalEval: Generated<boolean>;
  lastAccessedAt: Generated<Date>;
  createdAt: Generated<Date>;
}

/** 0025_diagnostics.ts — one row per surviving `DiagnosticEntry`
 * (packages/chess-analysis/src/diagnostics/diagnostic-entry.ts). `detail`
 * carries the rest of that interface's context fields (opening, phase,
 * clock, complexity, opponent rating) for the Task 58.1 evidence
 * drill-down; never queried on, so it stays untyped jsonb here. */
export interface DiagnosticObservationsTable {
  id: Generated<string>;
  userId: string;
  gameId: string;
  ply: number;
  code: DiagnosisCodeId;
  direction: Direction;
  failed: boolean;
  hwdl: number;
  severity: Severity;
  reachability: number;
  createdAt: Generated<Date>;
}

/** 0025_diagnostics.ts — one `buildDiagnosticProfile` result
 * (Task 55.3) per user/time-control/window; `profile` is the whole
 * `DiagnosticProfileEntry[]`. `timeControl` is the exact pooling key
 * (§4.2) — never the coarser `speed` column. */
export interface DiagnosticProfilesTable {
  id: Generated<string>;
  userId: string;
  timeControl: string;
  windowStart: Date;
  windowEnd: Date;
  computedAt: Generated<Date>;
  profile: Jsonb<unknown>;
}

/** 0028_puzzle_assignments.ts — one batch of Lichess puzzles handed to a
 * student for one diagnosed weakness (Task 59.2). `items` is a snapshot of
 * `PuzzleRecord[]` from `selectPuzzles` at assignment time, each widened
 * with a per-item `result`; see `PuzzleAssignmentItem` in
 * repositories/puzzle-assignments.ts. */
export interface PuzzleAssignmentsTable {
  id: Generated<string>;
  userId: string;
  diagnosisCode: DiagnosisCodeId;
  reason: string;
  items: Jsonb<unknown>;
  status: Generated<'pending' | 'in_progress' | 'completed'>;
  createdAt: Generated<Date>;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** 0029_puzzle_sessions.ts — one coach-guided walkthrough of a
 * `puzzle_assignments` batch (Task 59.4). Parallel to SessionsTable, not a
 * mode grafted onto it — see that migration's doc comment. */
export interface PuzzleSessionsTable {
  id: Generated<string>;
  assignmentId: string;
  userId: string;
  status: Generated<'active' | 'completed' | 'paused_no_credits' | 'abandoned'>;
  currentItemIndex: Generated<number>;
  startedAt: Generated<Date>;
  endedAt: Date | null;
}

/** Mirrors SessionMessagesTable; `itemIndex` stands in for `ply`. */
export interface PuzzleSessionMessagesTable {
  id: Generated<string>;
  puzzleSessionId: string;
  role: 'user' | 'assistant' | 'tool';
  content: Jsonb<unknown>;
  itemIndex: number | null;
  createdAt: Generated<Date>;
}

export interface LlmCallLogTable {
  id: Generated<string>;
  userId: string;
  sessionId: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: Generated<number>;
  creditsMetered: Generated<number>;
  purpose: string;
  createdAt: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  userLlmKeys: UserLlmKeysTable;
  games: GamesTable;
  analyses: AnalysesTable;
  sessions: SessionsTable;
  sessionMessages: SessionMessagesTable;
  sessionMoveNotes: SessionMoveNotesTable;
  findings: FindingsTable;
  focusAreas: FocusAreasTable;
  creditLedger: CreditLedgerTable;
  llmCallLog: LlmCallLogTable;
  positionEvaluations: PositionEvaluationsTable;
  diagnosticObservations: DiagnosticObservationsTable;
  diagnosticProfiles: DiagnosticProfilesTable;
  puzzleAssignments: PuzzleAssignmentsTable;
  puzzleSessions: PuzzleSessionsTable;
  puzzleSessionMessages: PuzzleSessionMessagesTable;
}
