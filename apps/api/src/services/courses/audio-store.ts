import { randomUUID } from 'node:crypto';
import { presignS3Url, signS3Request, type S3Credentials } from '../../lib/s3-sign.js';

/** docs/courses.md §8: where course note audio lives, in object storage
 * (Cloudflare R2). The creator's browser uploads each file straight to the
 * bucket with a short-lived signed URL, so no audio passes through, or is
 * kept in, the cluster; learners fetch it from `publicUrl` at the edge. */
export interface AudioStore {
  /** Where learners fetch a key, e.g. https://media.freechesscoach.org. */
  publicUrl: string;
  /** A URL the browser may PUT exactly `size` bytes of `contentType` to, once, soon. */
  presignUpload(key: string, contentType: string, size: number): URL;
  /** The object's size in bytes, or null when there is none. */
  size(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
}

/** A new object key for one note's file. Never reused, so a URL never serves
 * different audio and may be cached for good. */
export function newAudioKey(slug: string): string {
  return `${audioKeyPrefix(slug)}${randomUUID()}.mp3`;
}

export function audioKeyPrefix(slug: string): string {
  return `courses/${slug}/audio/`;
}

export interface AudioStoreConfig extends Omit<S3Credentials, 'region'> {
  /** The S3 endpoint the api uses: https://<account id>.r2.cloudflarestorage.com. */
  endpoint: string;
  /** The same bucket as the browser reaches it, when that differs (local dev: the compose service name is not a browser address). */
  uploadEndpoint: string;
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
const UPLOAD_ENDPOINT_ENV = 'COURSE_AUDIO_S3_UPLOAD_ENDPOINT';

/** All five set, or none (no storage: the studio cannot save note audio). Half
 * a configuration refuses to start rather than silently losing audio. */
export function audioStoreConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AudioStoreConfig | undefined {
  const values = Object.fromEntries(Object.entries(ENV).map(([field, name]) => [field, env[name]?.trim() ?? ''])) as Record<keyof typeof ENV, string>;
  const missing = Object.entries(ENV).filter(([field]) => !values[field as keyof typeof ENV]).map(([, name]) => name);
  if (missing.length === Object.keys(ENV).length) return undefined;
  if (missing.length) throw new Error(`Course audio storage is half configured; also set ${missing.join(', ')}`);
  const uploadEndpoint = env[UPLOAD_ENDPOINT_ENV]?.trim() || values.endpoint;
  const urls = { [ENV.endpoint]: values.endpoint, [UPLOAD_ENDPOINT_ENV]: uploadEndpoint, [ENV.publicUrl]: values.publicUrl };
  for (const [name, url] of Object.entries(urls)) {
    if (new URL(url).protocol !== 'https:' && !isLocalDevUrl(url)) throw new Error(`${name} must be an https URL`);
  }
  return { ...values, uploadEndpoint, publicUrl: values.publicUrl.replace(/\/+$/, '') };
}

/** Plain http only for a local dev bucket (the compose MinIO). */
function isLocalDevUrl(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  return protocol === 'http:' && (hostname === 'localhost' || hostname === 'minio');
}

/** R2 (or any S3-compatible bucket), path style: `<endpoint>/<bucket>/<key>`. */
export function createAudioStore(config: AudioStoreConfig, fetchImpl: typeof fetch = fetch): AudioStore {
  const credentials: S3Credentials = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: 'auto' };
  const objectUrl = (endpoint: string, key: string): URL => new URL(`${endpoint.replace(/\/+$/, '')}/${config.bucket}/${key}`);
  const send = async (method: 'HEAD' | 'DELETE', key: string): Promise<Response> => {
    const url = objectUrl(config.endpoint, key);
    return fetchImpl(url, { method, headers: signS3Request({ method, url, credentials }), signal: AbortSignal.timeout(15_000) });
  };
  return {
    publicUrl: config.publicUrl,
    presignUpload: (key, contentType, size) =>
      presignS3Url({
        method: 'PUT',
        url: objectUrl(config.uploadEndpoint, key),
        headers: { 'content-type': contentType, 'content-length': String(size) },
        expiresSeconds: 300,
        credentials
      }),
    async size(key) {
      const response = await send('HEAD', key);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Course audio storage HEAD ${key} failed: ${response.status}`);
      return Number(response.headers.get('content-length') ?? 0);
    },
    async delete(key) {
      // DELETE of a missing object is 204 on S3 and R2.
      const response = await send('DELETE', key);
      if (!response.ok) throw new Error(`Course audio storage DELETE ${key} failed: ${response.status}`);
    }
  };
}
