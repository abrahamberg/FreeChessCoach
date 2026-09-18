import { z } from 'zod';
import { DiagnosisCodeIdSchema } from './diagnosis/index.js';

/** docs/plan.md Phase 59 — response schemas for the puzzle-assignment/
 * puzzle-session HTTP surface (apps/api/src/routes/puzzle-assignments.ts,
 * puzzle-sessions.ts). Mirrors apps/api/src/db/repositories/puzzle-
 * assignments.ts's/puzzle-sessions.ts's row shapes over the wire — dates
 * arrive as ISO strings, not `Date` instances (fetch + JSON, not a driver
 * that parses timestamptz itself). */
export const PuzzleAssignmentItemResultSchema = z.enum(['pending', 'solved', 'failed', 'skipped']);
export type PuzzleAssignmentItemResult = z.infer<typeof PuzzleAssignmentItemResultSchema>;

export const PuzzleAssignmentItemSchema = z.object({
  puzzleId: z.string(),
  fen: z.string(),
  moves: z.array(z.string()),
  rating: z.number(),
  themes: z.array(z.string()),
  result: PuzzleAssignmentItemResultSchema
});
export type PuzzleAssignmentItem = z.infer<typeof PuzzleAssignmentItemSchema>;

export const PuzzleAssignmentStatusSchema = z.enum(['pending', 'in_progress', 'completed']);
export type PuzzleAssignmentStatus = z.infer<typeof PuzzleAssignmentStatusSchema>;

export const PuzzleAssignmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  diagnosisCode: DiagnosisCodeIdSchema,
  reason: z.string(),
  items: z.array(PuzzleAssignmentItemSchema),
  status: PuzzleAssignmentStatusSchema,
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable()
});
export type PuzzleAssignment = z.infer<typeof PuzzleAssignmentSchema>;

export const PuzzleAssignmentListResponseSchema = z.array(PuzzleAssignmentSchema);
export type PuzzleAssignmentListResponse = z.infer<typeof PuzzleAssignmentListResponseSchema>;

export const PuzzleSessionStatusSchema = z.enum(['active', 'completed', 'abandoned']);
export type PuzzleSessionStatus = z.infer<typeof PuzzleSessionStatusSchema>;

export const PuzzleSessionSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  userId: z.string(),
  status: PuzzleSessionStatusSchema,
  currentItemIndex: z.number().int().nonnegative(),
  /** How many of the current item's solution-line moves have been applied
   * to the live position — starts at 1 (the opponent's forced setup move
   * is auto-applied). */
  currentPly: z.number().int().nonnegative(),
  startedAt: z.string(),
  endedAt: z.string().nullable()
});
export type PuzzleSession = z.infer<typeof PuzzleSessionSchema>;

export const PuzzleSessionMessageSchema = z.object({
  id: z.string(),
  puzzleSessionId: z.string(),
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.unknown(),
  itemIndex: z.number().int().nonnegative().nullable(),
  createdAt: z.string()
});
export type PuzzleSessionMessage = z.infer<typeof PuzzleSessionMessageSchema>;

export const PuzzleSessionDetailSchema = PuzzleSessionSchema.extend({
  messages: z.array(PuzzleSessionMessageSchema),
  assignment: PuzzleAssignmentSchema,
  /** The live position for the current item — `item.fen` with
   * `item.moves.slice(0, currentPly)` already applied. Computed server-side
   * (apply-uci-sequence, packages/chess-analysis) so the client never
   * replays UCI itself. */
  currentFen: z.string()
});
export type PuzzleSessionDetail = z.infer<typeof PuzzleSessionDetailSchema>;

export const AttemptPuzzleMoveRequestSchema = z.object({
  san: z.string(),
  uci: z.string()
});
export type AttemptPuzzleMoveRequest = z.infer<typeof AttemptPuzzleMoveRequestSchema>;

/** Response for `POST /api/puzzle-sessions/:id/attempt-move` — a fast,
 * deterministic check against the item's solution line, decoupled from the
 * coach's own turn (see puzzle-session-turn.ts / puzzle-move-commit.ts).
 * `accepted: false` means nothing was persisted — `fen` is just the
 * last-committed position, for the client to revert to immediately. */
export const AttemptPuzzleMoveResponseSchema = z.object({
  accepted: z.boolean(),
  fen: z.string(),
  currentPly: z.number().int().nonnegative(),
  /** True once `currentPly` has reached the end of the item's solution
   * line — informational only, `advance_puzzle` (the coach's own tool
   * call) still decides when to actually leave this item. */
  lineComplete: z.boolean()
});
export type AttemptPuzzleMoveResponse = z.infer<typeof AttemptPuzzleMoveResponseSchema>;
