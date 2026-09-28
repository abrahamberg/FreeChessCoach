import { signS3Request, type S3Credentials } from '../../lib/s3-sign.js';

/** docs/courses.md §9: a copy of the published note audio in object storage
 * (Cloudflare R2), served to learners from `publicUrl` at the edge. Postgres
 * keeps the files; this is only a mirror, so the app works without one. */
export interface AudioMirror {
  /** Where learners fetch `key`, e.g. https://media.freechesscoach.org. */
  publicUrl: string;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** The object key (and public path) of one note's audio file. */
export function mirrorKey(slug: string, contentHash: string): string {
  return `courses/${slug}/audio/${contentHash}.wav`;
}

export interface R2MirrorConfig extends Omit<S3Credentials, 'region'> {
  /** The S3 endpoint: https://<account id>.r2.cloudflarestorage.com. */
  endpoint: string;
  bucket: string;
  publicUrl: string;
}

const ENV = {
  endpoint: 'COURSE_AUDIO_S3_ENDPOINT',
  bucket: 'COURSE_AUDIO_S3_BUCKET',
  accessKeyId: 'COURSE_AUDIO_S3_ACCESS_KEY_ID',
  secretAccessKey: 'COURSE_AUDIO_S3_SECRET_ACCESS_KEY',
  publicUrl: 'COURSE_AUDIO_PUBLIC_URL'
} as const;

/** All five set, or none (no mirror; learners get the files from the api).
 * Half a configuration refuses to start rather than silently serving nothing. */
export function audioMirrorConfigFromEnv(env: NodeJS.ProcessEnv = process.env): R2MirrorConfig | undefined {
  const values = Object.fromEntries(Object.entries(ENV).map(([field, name]) => [field, env[name]?.trim() ?? ''])) as Record<keyof typeof ENV, string>;
  const missing = Object.entries(ENV).filter(([field]) => !values[field as keyof typeof ENV]).map(([, name]) => name);
  if (missing.length === Object.keys(ENV).length) return undefined;
  if (missing.length) throw new Error(`Course audio mirror is half configured; also set ${missing.join(', ')}`);
  for (const field of ['endpoint', 'publicUrl'] as const) {
    if (new URL(values[field]).protocol !== 'https:') throw new Error(`${ENV[field]} must be an https URL`);
  }
  return { ...values, publicUrl: values.publicUrl.replace(/\/+$/, '') };
}

/** R2 through its S3 API: one signed PUT or DELETE per file. */
export function createR2Mirror(config: R2MirrorConfig, fetchImpl: typeof fetch = fetch): AudioMirror {
  const credentials: S3Credentials = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: 'auto' };
  const objectUrl = (key: string): URL => new URL(`${config.endpoint.replace(/\/+$/, '')}/${config.bucket}/${key}`);
  const send = async (method: 'PUT' | 'DELETE', key: string, body?: Uint8Array, headers?: Record<string, string>): Promise<void> => {
    const url = objectUrl(key);
    const signed = signS3Request({ method, url, headers, body, credentials });
    const response = await fetchImpl(url, { method, headers: signed, body, signal: AbortSignal.timeout(15_000) });
    // DELETE of a missing object is 204 on S3 and R2; anything else not ok is a failure.
    if (!response.ok) throw new Error(`Course audio mirror ${method} ${key} failed: ${response.status}`);
  };
  return {
    publicUrl: config.publicUrl,
    put: (key, bytes, contentType) =>
      send('PUT', key, bytes, { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' }),
    delete: (key) => send('DELETE', key)
  };
}
