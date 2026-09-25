import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { hostnameAddress, isPublicAddress } from './public-address.js';

export class BlockedEndpointError extends Error {
  constructor(host: string) {
    super(`${host} is a private or internal address; this server only calls public endpoints`);
    this.name = 'BlockedEndpointError';
  }
}

/** Rejects at connect time, after DNS, so a hostname that resolves (or
 * re-resolves) to an internal address is caught too, not just a literal. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, '', 0);
    const blocked = addresses.find((entry) => !isPublicAddress(entry.address));
    if (blocked || addresses.length === 0) return callback(new BlockedEndpointError(hostname), '', 0);
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    const first = addresses[0] as LookupAddress;
    return callback(null, first.address, first.family);
  });
};

const publicOnlyAgent = new Agent({ connect: { lookup: publicOnlyLookup } });

function assertPublicLiteral(input: string | URL | Request): void {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const host = hostnameAddress(url.hostname);
  // An IP literal never goes through `lookup`, so check it here.
  if (isIP(host) !== 0 && !isPublicAddress(host)) throw new BlockedEndpointError(host);
  if (host === 'localhost' || host.endsWith('.localhost')) throw new BlockedEndpointError(host);
}

const publicOnlyFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  assertPublicLiteral(input);
  // redirect: 'error' — a public endpoint must not bounce the request inward.
  return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    redirect: 'error',
    dispatcher: publicOnlyAgent
  });
}) as unknown as typeof globalThis.fetch;

/** The fetch for every call to a user-supplied LLM endpoint (the SDK
 * providers, the setup probe, cloud TTS). LLM_ALLOW_PRIVATE_ENDPOINTS=1 is for
 * a self-hosted install whose model server sits on its own network. */
export function endpointFetch(): typeof globalThis.fetch {
  return process.env.LLM_ALLOW_PRIVATE_ENDPOINTS === '1' ? globalThis.fetch : publicOnlyFetch;
}
