import { TtsSpeakRequestSchema } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import * as llmKeysRepo from '../db/repositories/llm-keys.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import type { KeyVault } from '../llm/key-vault.js';
import * as ttsService from '../services/tts.js';
import type { TtsConfig } from '../services/tts.js';
import * as userProfileService from '../services/user-profile.js';

export function registerTtsRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  keyVault: KeyVault,
  config: TtsConfig
): void {
  app.post('/api/tts/speak', async (request, reply) => {
    const parsed = TtsSpeakRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    // Server-side gate, not just a UI convenience: a client that ignores the
    // Settings toggle (or an old/cached page) must not be able to use the
    // OpenAI TTS backend the account never opted into.
    if (!user.ttsEnabled || user.ttsBackend !== 'openai') {
      throw new ForbiddenError('Coach voice (OpenAI) is not enabled for this account');
    }

    // The app is BYOK-only — TTS needs an OpenAI key specifically (the cloud
    // TTS API has no Anthropic equivalent), so resolve the user's saved
    // OpenAI key here. A user with only an Anthropic BYOK key can't use
    // coach voice until they add one.
    const keys = await llmKeysRepo.findAllByUser(db, user.id);
    const openaiKey = keys.find((row) => row.provider === 'openai');
    if (!openaiKey) {
      throw new ForbiddenError('Coach voice requires an OpenAI API key — add one in Settings.');
    }
    const apiKey = keyVault.decrypt({ ciphertext: openaiKey.keyCiphertext, iv: openaiKey.keyIv });

    const audio = await ttsService.speak(config, apiKey, {
      persona: parsed.data.persona,
      text: parsed.data.text
    });

    return reply.header('content-type', 'audio/mpeg').send(audio);
  });
}
