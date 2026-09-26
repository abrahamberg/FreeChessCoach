import { describe, expect, test } from 'vitest';
import { UpdateLlmModelsRequestSchema } from './llm.js';
import { cloudProviderOf } from './llm-providers.js';

describe('cloudProviderOf', () => {
  test('names the three providers by exact host', () => {
    expect(cloudProviderOf('https://api.openai.com/v1')).toBe('openai');
    expect(cloudProviderOf('https://api.anthropic.com/v1')).toBe('anthropic');
    expect(cloudProviderOf('https://openrouter.ai/api/v1')).toBe('openrouter');
  });

  test('a look-alike host is other, so a saved key is never reused for it', () => {
    expect(cloudProviderOf('https://api.openai.com.evil.test/v1')).toBe('other');
    expect(cloudProviderOf('https://evil.test/?api.openai.com')).toBe('other');
    expect(cloudProviderOf('https://my-resource.openai.azure.com/openai/v1')).toBe('other');
    expect(cloudProviderOf('not a url')).toBe('other');
    expect(cloudProviderOf(undefined)).toBe('other');
  });
});

describe('UpdateLlmModelsRequestSchema', () => {
  test('refuses an endpoint or key, which a model change must not touch', () => {
    const base = { highModel: 'gpt-6-sol', unlockPhrase: 'correct horse' };
    expect(UpdateLlmModelsRequestSchema.safeParse(base).success).toBe(true);
    expect(UpdateLlmModelsRequestSchema.safeParse({ ...base, endpoint: 'https://evil.test' }).success).toBe(false);
    expect(UpdateLlmModelsRequestSchema.safeParse({ ...base, apiKey: 'sk' }).success).toBe(false);
  });

  test('needs the unlock phrase; a blank new phrase means keep it', () => {
    expect(UpdateLlmModelsRequestSchema.safeParse({ highModel: 'gpt-6-sol' }).success).toBe(false);
    const kept = UpdateLlmModelsRequestSchema.parse({ highModel: 'gpt-6-sol', unlockPhrase: 'correct horse', newUnlockPhrase: ' ' });
    expect(kept.newUnlockPhrase).toBeUndefined();
    expect(UpdateLlmModelsRequestSchema.safeParse({ highModel: 'gpt-6-sol', unlockPhrase: 'x', newUnlockPhrase: 'short' }).success).toBe(false);
  });
});
