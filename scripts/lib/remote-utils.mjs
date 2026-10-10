// Pure helpers for the phone-remote relay (scripts/lib/dev-remote.mjs).

/** Commands a phone may send to the TV. */
export const REMOTE_COMMANDS = ['begin', 'correct', 'pass', 'pause', 'resume', 'continue', 'spin'];

const VIRTUAL = /(vEthernet|VirtualBox|VMware|Hyper-V|WSL|Docker|Loopback|Tailscale|ZeroTier|vboxnet|utun|tun|tap|bridge)/i;

/** Rank a private IPv4 address: home routers almost always use 192.168.x.x. */
function rank(address) {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return 3;
}

/**
 * LAN IPv4 addresses a phone on the same Wi-Fi can reach, best first.
 * `interfaces` has the shape of os.networkInterfaces().
 */
export function lanAddresses(interfaces) {
  const found = [];
  for (const [name, list] of Object.entries(interfaces ?? {})) {
    for (const i of list ?? []) {
      const v4 = i.family === 'IPv4' || i.family === 4;
      if (!v4 || i.internal || i.address.startsWith('169.254.')) continue;
      found.push({ name, address: i.address, virtual: VIRTUAL.test(name) });
    }
  }
  found.sort((a, b) => Number(a.virtual) - Number(b.virtual) || rank(a.address) - rank(b.address));
  return found;
}

/** True when a request comes from this computer (the TV browser on localhost). */
export function isLoopback(remoteAddress) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(remoteAddress));
}

/** Phone URL for an address. The token lives in the hash so it never appears in server logs. */
export function remoteUrl(address, port, token) {
  return `http://${address}:${port}/#remote/${token}`;
}
