import { describe, expect, test } from 'vitest';
import { isPublicAddress } from './public-address.js';

describe('isPublicAddress', () => {
  test.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe',
    'not-an-ip'
  ])('%s is not public', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  test.each(['8.8.8.8', '104.18.7.192', '2606:4700::6810:84e5', '::ffff:8.8.8.8'])('%s is public', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});
