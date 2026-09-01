import type { ColumnType, Generated } from 'kysely';
import type { GameSpeed, PgnMoveComment } from '@freechesscoach/chess-analysis';
import type { BotConfig, CoachPersona, EngineMode, MistakeCategory, MoveQuality, RatingBand, RatingSource, SessionMode, TtsBackend } from '@freechesscoach/shared';

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
  source: 'paste' | 'upload' | 'lichess' | 'coach_play' | 'vs_bot';
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
}

export interface AnalysesTable {
  id: Generated<string>;
  gameId: string;
  status: 'queued' | 'engine_running' | 'planning' | 'ready' | 'failed';
  error: string | null;
  engineEvals: Jsonb<unknown> | null;
  coachingPlan: Jsonb<unknown> | null;
  classifiedMoves: Jsonb<unknown> | null;
  bookReport: Jsonb<unknown> | null;
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
  createdAt: Generated<Date>;
}

export interface FocusAreasTable {
  id: Generated<string>;
  userId: string;
  category: MistakeCategory;
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

export interface GameMoveQualitiesTable {
  id: Generated<string>;
  gameId: string;
  ply: number;
  moveSan: string;
  mover: 'white' | 'black';
  quality: MoveQuality;
  cpLoss: number;
  bestLineSan: Jsonb<string[]>;
  evalAfterCp: number;
  reasons: Jsonb<string[]>;
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
  gameMoveQualities: GameMoveQualitiesTable;
}
