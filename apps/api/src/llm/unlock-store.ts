import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { StoredLlmSetupSchema, type StoredLlmSetup } from '@freechesscoach/shared';

const CACHE_ALGORITHM = 'aes-256-gcm';
const CACHE_IV_LENGTH = 12;
const CACHE_TAG_LENGTH = 16;
const CACHE_KEY_LENGTH = 32;

export interface LlmUnlockStore {
  unlock(userId: string, setup: StoredLlmSetup): Promise<void>;
  get(userId: string): Promise<StoredLlmSetup | null>;
  lock(userId: string): Promise<void>;
}

export interface UnlockStoreConfig {
  pepper: string;
  cacheKeyBase64: string;
  ttlSeconds: number;
}

/** Uses a keyed user hash so Redis contains no database UUID/email mapping.
 * Values are encrypted too: a Redis read alone is not enough to recover API
 * keys. The cache is deliberately short-lived and refreshed only by active
 * model use. */
export function createRedisLlmUnlockStore(redisUrl: string, config: UnlockStoreConfig): LlmUnlockStore {
  const client = createClient({ url: redisUrl });
  client.on('error', (error) => console.error('LLM unlock Redis error', error));
  const connected = client.connect();
  const cacheKey = parseCacheKey(config.cacheKeyBase64);

  return {
    async unlock(userId, setup) {
      await connected;
      const validSetup = StoredLlmSetupSchema.parse(setup);
      await client.set(cacheName(userId, config.pepper), encryptCacheValue(validSetup, cacheKey), { EX: config.ttlSeconds });
    },
    async get(userId) {
      await connected;
      const value = await client.get(cacheName(userId, config.pepper));
      if (!value) return null;
      await client.expire(cacheName(userId, config.pepper), config.ttlSeconds);
      return StoredLlmSetupSchema.parse(decryptCacheValue(value, cacheKey));
    },
    async lock(userId) {
      await connected;
      await client.del(cacheName(userId, config.pepper));
    }
  };
}

/** Used by unit tests and local callers that intentionally do not run Redis.
 * Production uses the shared Redis implementation so the API and worker see
 * the same active unlock. */
export function createMemoryLlmUnlockStore(config: Pick<UnlockStoreConfig, 'pepper' | 'ttlSeconds'>): LlmUnlockStore {
  const entries = new Map<string, { setup: StoredLlmSetup; expiresAt: number }>();
  return {
    async unlock(userId, setup) {
      const validSetup = StoredLlmSetupSchema.parse(setup);
      entries.set(cacheName(userId, config.pepper), { setup: validSetup, expiresAt: Date.now() + config.ttlSeconds * 1000 });
    },
    async get(userId) {
      const key = cacheName(userId, config.pepper);
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return null;
      }
      entry.expiresAt = Date.now() + config.ttlSeconds * 1000;
      return StoredLlmSetupSchema.parse(entry.setup);
    },
    async lock(userId) {
      entries.delete(cacheName(userId, config.pepper));
    }
  };
}

function cacheName(userId: string, pepper: string): string {
  const userHash = createHmac('sha256', pepper).update(userId).digest('hex');
  return `llm-unlock:${userHash}`;
}

function parseCacheKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== CACHE_KEY_LENGTH) throw new Error('LLM_UNLOCK_CACHE_KEY must decode to 32 bytes');
  return key;
}

function encryptCacheValue(setup: StoredLlmSetup, key: Buffer): string {
  const iv = randomBytes(CACHE_IV_LENGTH);
  const cipher = createCipheriv(CACHE_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(setup), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([iv, ciphertext]).toString('base64');
}

function decryptCacheValue(value: string, key: Buffer): StoredLlmSetup {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length <= CACHE_IV_LENGTH + CACHE_TAG_LENGTH) throw new Error('LLM unlock cache value is malformed');
  const iv = bytes.subarray(0, CACHE_IV_LENGTH);
  const ciphertext = bytes.subarray(CACHE_IV_LENGTH);
  const authTag = ciphertext.subarray(ciphertext.length - CACHE_TAG_LENGTH);
  const decipher = createDecipheriv(CACHE_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const payload = Buffer.concat([decipher.update(ciphertext.subarray(0, -CACHE_TAG_LENGTH)), decipher.final()]).toString('utf8');
  return StoredLlmSetupSchema.parse(JSON.parse(payload));
}
