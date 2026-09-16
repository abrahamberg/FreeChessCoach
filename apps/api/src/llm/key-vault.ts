import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { StoredLlmSetupSchema, type StoredLlmSetup } from '@freechesscoach/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface EncryptedLlmSetup {
  ciphertext: Buffer;
  iv: Buffer;
  salt: Buffer;
}

/** A password-based envelope. The server master key is deliberately absent:
 * a database dump alone cannot decrypt this payload. */
export interface UserSetupVault {
  encrypt(setup: StoredLlmSetup, unlockPhrase: string): EncryptedLlmSetup;
  decrypt(encrypted: EncryptedLlmSetup, unlockPhrase: string): StoredLlmSetup;
}

export function createUserSetupVault(): UserSetupVault {
  return {
    encrypt(setup, unlockPhrase) {
      const salt = randomBytes(SALT_LENGTH);
      const iv = randomBytes(IV_LENGTH);
      const key = deriveKey(unlockPhrase, salt);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const payload = JSON.stringify({ ...setup, randomLine: randomBytes(24).toString('hex') });
      const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final(), cipher.getAuthTag()]);
      return { ciphertext, iv, salt };
    },
    decrypt({ ciphertext, iv, salt }, unlockPhrase) {
      if (ciphertext.length <= AUTH_TAG_LENGTH) throw new Error('Encrypted setup is malformed');
      const authTag = ciphertext.subarray(ciphertext.length - AUTH_TAG_LENGTH);
      const encryptedPayload = ciphertext.subarray(0, ciphertext.length - AUTH_TAG_LENGTH);
      const decipher = createDecipheriv(ALGORITHM, deriveKey(unlockPhrase, salt), iv);
      decipher.setAuthTag(authTag);
      const payload = Buffer.concat([decipher.update(encryptedPayload), decipher.final()]).toString('utf8');
      const parsed: unknown = JSON.parse(payload);
      return StoredLlmSetupSchema.parse(parsed);
    }
  };
}

function deriveKey(unlockPhrase: string, salt: Buffer): Buffer {
  return scryptSync(unlockPhrase, salt, KEY_LENGTH, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
