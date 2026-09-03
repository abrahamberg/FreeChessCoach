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

export const PuzzleSessionStatusSchema = z.enum(['active', 'completed', 'paused_no_credits', 'abandoned']);
export type PuzzleSessionStatus = z.infer<typeof PuzzleSessionStatusSchema>;

export const PuzzleSessionSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  userId: z.string(),
  status: PuzzleSessionStatusSchema,
  currentItemIndex: z.number().int().nonnegative(),
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
  assignment: PuzzleAssignmentSchema
});
export type PuzzleSessionDetail = z.infer<typeof PuzzleSessionDetailSchema>;
