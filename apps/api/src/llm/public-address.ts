import { BlockList, isIP } from 'node:net';

/** Addresses a user-supplied LLM endpoint may never resolve to: loopback,
 * RFC 1918/6598 private, link-local (cloud metadata lives at 169.254.169.254),
 * multicast, reserved, and the IPv6 equivalents. Without this, "endpoint" is a
 * way to make the api pod POST into the cluster (engine, Redis, the internal
 * relay) or its cloud's metadata service and read back part of the answer. */
const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3]
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, 'ipv6');
}

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

export function isPublicAddress(address: string): boolean {
  const mapped = IPV4_MAPPED.exec(address);
  if (mapped?.[1]) return isPublicAddress(mapped[1]);
  const family = isIP(address);
  if (family === 0) return false;
  return !NON_PUBLIC.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** `new URL()` keeps IPv6 hosts bracketed (`[::1]`). */
export function hostnameAddress(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}
