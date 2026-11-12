import { describe, expect, it } from 'vitest';
import { clearPendingSave, keepPendingSave, readPendingSave } from './pending-save.js';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    length: 0
  };
}

describe('pending save', () => {
  it('carries the game across sign-in as an import request', () => {
    const storage = memoryStorage();
    keepPendingSave({ pgn: '1. e4 e5 *', userColor: 'black', origin: { source: 'pgn', playedAt: null } }, storage);
    expect(readPendingSave(storage)).toEqual({ pgn: '1. e4 e5 *', userColor: 'black', source: 'paste', playedAt: null });
    clearPendingSave(storage);
    expect(readPendingSave(storage)).toBeNull();
  });

  it('ignores a stored value that is not an import request', () => {
    const storage = memoryStorage();
    storage.setItem('fcc:free-review-save', '{"pgn":""}');
    expect(readPendingSave(storage)).toBeNull();
  });
});
