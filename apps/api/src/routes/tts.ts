import { TtsSpeakRequestSchema } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import * as llmSetupsRepo from '../db/repositories/llm-setups.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import type { LlmUnlockStore } from '../llm/unlock-store.js';
import * as ttsService from '../services/tts.js';
import type { TtsConfig } from '../services/tts.js';
import * as userProfileService from '../services/user-profile.js';

export function registerTtsRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  unlockStore: LlmUnlockStore,
  config: TtsConfig
): void {
  app.post('/api/tts/speak', async (request, reply) => {
    const parsed = TtsSpeakRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));

    const user = await userProfileService.getOrCreate(db, request.user);
    if (!user.ttsEnabled || user.ttsBackend !== 'openai') {
      throw new ForbiddenError('Coach voice is not enabled for this account');
    }
    const stored = await llmSetupsRepo.findByUser(db, user.id);
    const setup = await unlockStore.get(user.id);
    if (!stored || !setup) throw new ForbiddenError('Unlock your AI setup in Settings before using coach voice.');
    if (!setup.voiceModel) throw new ForbiddenError('Coach voice is unavailable because no voice model was configured.');

    const audio = await ttsService.speak(config, setup, { persona: parsed.data.persona, text: parsed.data.text });
    return reply.header('content-type', 'audio/mpeg').send(audio);
  });
}
