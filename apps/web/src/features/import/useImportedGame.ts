import { GameReviewTierSchema, GameSourceSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet } from '../../api/client.js';

/** Just what `useGameActions` needs to start a coaching session for a game
 * that is not in any list on this page: its tier decides whether it must be
 * promoted first (a re-imported duplicate may already be at the coach tier). */
const ImportedGameSchema = z.object({
  id: z.string(),
  source: GameSourceSchema,
  reviewTier: GameReviewTierSchema.default('imported')
});

/** GET /api/games/:id for a just-imported game — only fetched once asked
 * (`gameId` non-null). */
export function useImportedGame(gameId: string | null) {
  return useQuery({
    queryKey: ['imported-game', gameId],
    queryFn: async ({ signal }) => {
      const game = await apiGet(`/api/games/${gameId}`, ImportedGameSchema, signal);
      return { ...game, sessionId: null };
    },
    enabled: gameId !== null
  });
}
