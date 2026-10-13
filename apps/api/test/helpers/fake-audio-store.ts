import type { AudioStore } from '../../src/services/courses/audio-store.js';

/** A bucket in memory: tests "upload" with `put`, as the browser would to the signed URL. */
export function fakeAudioStore(): AudioStore & { put(key: string, bytes: number): void; objects: Map<string, number>; presigned: { key: string; contentType: string; size: number }[] } {
  const objects = new Map<string, number>();
  const presigned: { key: string; contentType: string; size: number }[] = [];
  return {
    publicUrl: 'https://media.test',
    objects,
    presigned,
    put: (key, bytes) => void objects.set(key, bytes),
    presignUpload(key, contentType, size) {
      presigned.push({ key, contentType, size });
      return new URL(`https://bucket.test/${key}?signed=1`);
    },
    size: (key) => Promise.resolve(objects.get(key) ?? null),
    delete: (key) => Promise.resolve(void objects.delete(key))
  };
}
