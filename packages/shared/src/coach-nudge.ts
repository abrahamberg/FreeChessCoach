import { z } from 'zod';
import { GameListItemSchema } from './game.js';

/** GET /api/users/me/coach-nudge — what the student's coach tells them to
 * do next on the Games page. The server picks the situation (first match
 * wins, in this order); the web app picks the coach's words for it.
 *
 * - practice:       a practice set is assigned — do that before anything else
 * - import_first:   a new student still short of the 15 games pattern tracking needs (first time)
 * - first_coaching: never coached on a game yet — offer one (first time)
 * - first_play:     never played a game with the coach yet (first time)
 * - import_more:    nothing imported for more than COACH_NUDGE_STALE_DAYS days
 * - coach_game:     not coached for more than COACH_NUDGE_STALE_DAYS days, and a game is waiting
 * - play_coach:     no game with the coach for more than COACH_NUDGE_STALE_DAYS days
 * - idle:           none of the above */
export const COACH_NUDGE_STALE_DAYS = 3;

export const CoachNudgeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('practice'), assignmentId: z.string() }),
  z.object({ kind: z.literal('import_first'), ratedGames: z.number().int(), required: z.number().int() }),
  z.object({ kind: z.literal('first_coaching'), game: GameListItemSchema }),
  z.object({ kind: z.literal('first_play') }),
  z.object({ kind: z.literal('import_more') }),
  z.object({ kind: z.literal('coach_game'), game: GameListItemSchema }),
  z.object({ kind: z.literal('play_coach') }),
  z.object({ kind: z.literal('idle') })
]);
export type CoachNudge = z.infer<typeof CoachNudgeSchema>;
export type CoachNudgeKind = CoachNudge['kind'];
