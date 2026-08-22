import { z } from 'zod';

export const PlayerBookReportSchema = z.object({
  lastBookPly: z.number().int().nonnegative(),
  leftBookPly: z.number().int().nonnegative().nullable(),
  leftBookMove: z.string().nullable(),
  bookAlternatives: z.array(z.string())
});
export type PlayerBookReport = z.infer<typeof PlayerBookReportSchema>;

export const BookReportSchema = z.object({
  source: z.string().min(1),
  eco: z.string().min(1).nullable(),
  ecoVolume: z.enum(['A', 'B', 'C', 'D', 'E']).nullable(),
  name: z.string().min(1).nullable(),
  family: z.string().min(1).nullable(),
  variation: z.string().min(1).nullable(),
  namedAtPly: z.number().int().nonnegative().nullable(),
  lastBookPly: z.number().int().nonnegative(),
  players: z.object({
    white: PlayerBookReportSchema,
    black: PlayerBookReportSchema
  })
});
export type BookReport = z.infer<typeof BookReportSchema>;
