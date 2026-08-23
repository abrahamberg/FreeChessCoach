import { TtsSpeakRequestSchema } from '@chess-coach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { createCreditsService } from '../services/credits.js';
import * as ttsService from '../services/tts.js';
import type { TtsConfig } from '../services/tts.js';
import * as userProfileService from '../services/user-profile.js';

export function registerTtsRoutes(app: FastifyInstance, db: Kysely<Database>, config: TtsConfig): void {
  const creditsService = createCreditsService(db);

  app.post('/api/tts/speak', async (request, reply) => {
    const parsed = TtsSpeakRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    // Server-side gate, not just a UI convenience: a client that ignores the
    // Settings toggle (or an old/cached page) must not be able to spend
    // credits the account never opted into.
    if (!user.ttsEnabled || user.ttsBackend !== 'openai') {
      throw new ForbiddenError('Coach voice (OpenAI) is not enabled for this account');
    }

    const audio = await ttsService.speak(db, config, creditsService, {
      userId: user.id,
      sessionId: null,
      persona: parsed.data.persona,
      text: parsed.data.text
    });

    return reply.header('content-type', 'audio/mpeg').send(audio);
  });
}
