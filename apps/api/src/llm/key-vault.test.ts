import { describe, expect, test } from 'vitest';
import { createUserSetupVault } from './key-vault.js';

const setup = {
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-super-secret',
  lowModel: 'luna',
  highModel: 'terra',
  voiceModel: 'gpt-4o-mini-tts',
  protocol: 'openai-chat' as const
};

describe('createUserSetupVault', () => {
  test('round-trips a complete setup with the unlock phrase', () => {
    const vault = createUserSetupVault();
    const encrypted = vault.encrypt(setup, 'correct horse battery staple');
    expect(vault.decrypt(encrypted, 'correct horse battery staple')).toEqual(setup);
  });

  test('uses a fresh salt and IV and rejects a wrong phrase or tampering', () => {
    const vault = createUserSetupVault();
    const first = vault.encrypt(setup, 'correct horse battery staple');
    const second = vault.encrypt(setup, 'correct horse battery staple');
    expect(first.salt.equals(second.salt)).toBe(false);
    expect(first.iv.equals(second.iv)).toBe(false);
    expect(() => vault.decrypt(first, 'wrong phrase')).toThrow();
    first.ciphertext[0] = (first.ciphertext[0] ?? 0) ^ 0xff;
    expect(() => vault.decrypt(first, 'correct horse battery staple')).toThrow();
  });
});
