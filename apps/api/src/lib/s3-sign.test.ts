import { expect, test } from 'vitest';
import { presignS3Url, signS3Request } from './s3-sign.js';

// The "GET Object" example of AWS's SigV4 documentation for S3
// (sig-v4-header-based-auth.html), with its published signature.
test('signs the documented S3 GET example exactly', () => {
  const headers = signS3Request({
    method: 'GET',
    url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
    headers: { Range: 'bytes=0-9' },
    credentials: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' },
    now: new Date('2013-05-24T00:00:00Z')
  });
  expect(headers.authorization).toBe(
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
  );
  expect(headers['x-amz-content-sha256']).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

// The "presigned URL" example of AWS's SigV4 documentation for S3
// (sigv4-query-string-auth.html), with its published signature.
test('presigns the documented S3 GET example exactly', () => {
  const url = presignS3Url({
    method: 'GET',
    url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
    expiresSeconds: 86_400,
    credentials: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' },
    now: new Date('2013-05-24T00:00:00Z')
  });
  expect(url.searchParams.get('X-Amz-Signature')).toBe('aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
});
