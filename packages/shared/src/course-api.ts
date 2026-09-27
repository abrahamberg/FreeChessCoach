import { z } from 'zod';
import { COACH_PERSONAS, RATING_BANDS } from './constants.js';
import { CourseDocumentSchema, CourseKindSchema, CourseStatusSchema } from './course.js';

/** The intake form (docs/courses.md §5.3). `learnerSide` null lets code
 * infer it (§3); the route refuses when it can't. */
export const CreateCourseRequestSchema = z.object({
  pgn: z.string().trim().min(1, 'Paste a PGN').max(200_000),
  kind: CourseKindSchema,
  direction: z.string().trim().max(500).default(''),
  levelBand: z.enum(RATING_BANDS).default('improving'),
  learnerSide: z.enum(['white', 'black']).nullable().default(null),
  coachPersona: z.enum(COACH_PERSONAS)
});
export type CreateCourseRequest = z.input<typeof CreateCourseRequestSchema>;

export const CourseResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: CourseKindSchema,
  status: CourseStatusSchema,
  title: z.string(),
  direction: z.string(),
  document: CourseDocumentSchema,
  updatedAt: z.string()
});
export type CourseResponse = z.infer<typeof CourseResponseSchema>;

export const CourseSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: CourseKindSchema,
  status: CourseStatusSchema,
  title: z.string(),
  updatedAt: z.string()
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export const CourseListResponseSchema = z.object({ courses: z.array(CourseSummarySchema) });
export type CourseListResponse = z.infer<typeof CourseListResponseSchema>;

export const SaveCourseDraftRequestSchema = z.object({ document: CourseDocumentSchema });
export type SaveCourseDraftRequest = z.infer<typeof SaveCourseDraftRequestSchema>;
