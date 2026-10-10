import { describe, expect, it } from 'vitest';
import { isLoopback, lanAddresses, remoteUrl } from './remote-utils.mjs';

describe('lanAddresses', () => {
  it('prefers real Wi-Fi 192.168 addresses and skips internal, IPv6, link-local and virtual adapters last', () => {
    const list = lanAddresses({
      'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
      'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.48.1', internal: false }],
      Ethernet: [{ family: 'IPv4', address: '169.254.10.2', internal: false }],
      'Wi-Fi': [
        { family: 'IPv6', address: 'fe80::1', internal: false },
        { family: 'IPv4', address: '192.168.1.23', internal: false },
      ],
      Corp: [{ family: 4, address: '10.0.0.5', internal: false }],
    });
    expect(list.map((i) => i.address)).toEqual(['192.168.1.23', '10.0.0.5', '172.20.48.1']);
    expect(list[2].virtual).toBe(true);
  });

  it('handles no interfaces', () => {
    expect(lanAddresses({})).toEqual([]);
    expect(lanAddresses(undefined)).toEqual([]);
  });
});

describe('helpers', () => {
  it('recognises loopback addresses', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopback('192.168.1.5')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });

  it('builds the phone URL with the token in the hash', () => {
    expect(remoteUrl('192.168.1.23', 5173, 'abc')).toBe('http://192.168.1.23:5173/#remote/abc');
  });
});
