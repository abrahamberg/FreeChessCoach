import { describe, expect, test } from 'vitest';
import { initialDraft, withProvider } from './useLlmSetupDraft.js';

const fresh = initialDraft({ configured: false, unlocked: false, voiceAvailable: false });

describe('setup draft providers', () => {
  test('a new setup starts on OpenAI with sol/luna, voice and Flex', () => {
    expect(fresh).toMatchObject({ provider: 'openai', endpoint: 'https://api.openai.com/v1', highModel: 'gpt-6-sol', lowModel: 'gpt-6-luna', voiceModel: 'gpt-4o-mini-tts', useFlex: true });
  });

  test('Anthropic brings its own models and drops voice and Flex', () => {
    expect(withProvider(fresh, 'anthropic')).toMatchObject({ endpoint: 'https://api.anthropic.com/v1', highModel: 'claude-sonnet-5', lowModel: 'claude-haiku-4-5-20251001', voiceModel: '', useFlex: false });
  });

  test('OpenRouter uses its prefixed ids and no Flex', () => {
    expect(withProvider(fresh, 'openrouter')).toMatchObject({ highModel: 'openai/gpt-6-sol', lowModel: 'openai/gpt-6-luna', useFlex: false });
  });

  test('Other clears a named provider URL but keeps a typed one', () => {
    expect(withProvider(fresh, 'other').endpoint).toBe('');
    const typed = { ...fresh, provider: 'other' as const, endpoint: 'https://x.openai.azure.com/openai/v1' };
    expect(withProvider(typed, 'other').endpoint).toBe('https://x.openai.azure.com/openai/v1');
  });

  test('a saved setup keeps its models and finds its provider from the URL', () => {
    const saved = initialDraft({ configured: true, unlocked: true, voiceAvailable: false, endpoint: 'https://openrouter.ai/api/v1', protocol: 'anthropic', highModel: 'anthropic/claude-sonnet-5' });
    expect(saved).toMatchObject({ provider: 'openrouter', highModel: 'anthropic/claude-sonnet-5', lowModel: '', useFlex: false });
  });
});
