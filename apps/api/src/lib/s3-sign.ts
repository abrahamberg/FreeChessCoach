import { createHash, createHmac } from 'node:crypto';

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** "auto" for Cloudflare R2. */
  region: string;
}

const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding of one path segment, as SigV4 wants it. */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * AWS Signature Version 4 for one S3 request with no query string (HEAD and
 * DELETE of one object). R2 speaks the same protocol.
 * Returns the headers to send, `authorization` included; `headers` must not
 * repeat `host`, `x-amz-date` or `x-amz-content-sha256`.
 */
export function signS3Request(options: {
  method: string;
  url: URL;
  headers?: Record<string, string>;
  body?: Uint8Array;
  credentials: S3Credentials;
  now?: Date;
}): Record<string, string> {
  const { method, url, credentials } = options;
  const amzDate = (options.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(options.body ?? new Uint8Array());
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(options.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value.trim()])),
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  const names = Object.keys(headers).sort();
  const path = url.pathname.split('/').map((segment) => encodeSegment(decodeURIComponent(segment))).join('/');
  const canonical = [method, path, '', ...names.map((name) => `${name}:${headers[name]}`), '', names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${credentials.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), credentials.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  const { host: _host, ...sent } = headers;
  return {
    ...sent,
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`
  };
}

/**
 * AWS Signature Version 4 as a query string (a presigned URL), so a browser
 * can send one request without holding any credentials. The payload is not
 * signed; `headers` (e.g. content-type, content-length) are, so the browser
 * must send exactly those. R2 speaks the same protocol.
 */
export function presignS3Url(options: {
  method: string;
  url: URL;
  headers?: Record<string, string>;
  expiresSeconds: number;
  credentials: S3Credentials;
  now?: Date;
}): URL {
  const { method, url, credentials } = options;
  const amzDate = (options.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${credentials.region}/s3/aws4_request`;
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(options.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value.trim()])),
    host: url.host
  };
  const names = Object.keys(headers).sort();
  const query: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(options.expiresSeconds)],
    ['X-Amz-SignedHeaders', names.join(';')]
  ];
  const canonicalQuery = query.map(([name, value]) => `${encodeSegment(name)}=${encodeSegment(value)}`).join('&');
  const path = url.pathname.split('/').map((segment) => encodeSegment(decodeURIComponent(segment))).join('/');
  const canonical = [method, path, canonicalQuery, ...names.map((name) => `${name}:${headers[name]}`), '', names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), credentials.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  const signed = new URL(url);
  signed.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return signed;
}
