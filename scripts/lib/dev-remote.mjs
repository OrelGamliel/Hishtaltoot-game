// Vite dev-server plugin: relays the game between the TV (browser on this computer) and phones
// on the same Wi-Fi.
//
//   TV  --POST /__remote/state-->  server  --SSE /__remote/events-->  phones   (what to show)
//   TV  <--SSE /__remote/tv-events-- server <--POST /__remote/command-- phones (button presses)
//
// TV endpoints only answer requests from this computer. Phone endpoints need the random token
// that is in the QR code, which changes every time the dev server starts.
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { REMOTE_COMMANDS, isLoopback, lanAddresses, remoteUrl } from './remote-utils.mjs';

const MAX_BODY = 2 * 1024 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Opens a Server-Sent Events stream and returns a writer. */
function openStream(req, res, onClose) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1500\n\n');
  const write = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // Comments keep idle connections (and phone browsers) from timing out.
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    onClose();
  });
  return write;
}

export function devRemote() {
  const token = randomBytes(12).toString('hex');
  /** latest snapshot published by the TV */
  let snapshot = null;
  const phones = new Set();
  /** TV streams, newest last; commands go only to the newest so two tabs never both act */
  const tvs = [];
  let port = 5173;

  const broadcast = (event, data) => phones.forEach((w) => w(event, data));
  const status = () => ({ phones: phones.size, tv: tvs.length > 0 });

  const routes = {
    /** TV: token, phone URLs and connection counts (for the QR dialog). */
    'GET info'(req, res) {
      if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, { error: 'Open the game on this computer via localhost' });
      const addresses = lanAddresses(networkInterfaces()).map((a) => ({
        ...a,
        url: remoteUrl(a.address, port, token),
      }));
      send(res, 200, { token, addresses, ...status() });
    },

    /** TV: publishes what phones should show. */
    async 'POST state'(req, res) {
      if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, { error: 'TV only' });
      snapshot = await readJson(req);
      broadcast('state', snapshot);
      send(res, 200, { ok: true, ...status() });
    },

    /** TV: receives commands pressed on phones. */
    'GET tv-events'(req, res) {
      if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, { error: 'TV only' });
      const entry = { write: null };
      entry.write = openStream(req, res, () => {
        const i = tvs.indexOf(entry);
        if (i !== -1) tvs.splice(i, 1);
        broadcast('status', status());
      });
      tvs.push(entry);
      entry.write('status', status());
      broadcast('status', status());
    },

    /** Phone: is my token still valid? (It changes when the dev server restarts.) */
    'GET check'(req, res, url) {
      if (url.searchParams.get('token') !== token) return send(res, 403, { error: 'Scan the QR code again' });
      send(res, 200, { ok: true, ...status() });
    },

    /** Phone: live stream of snapshots. */
    'GET events'(req, res, url) {
      if (url.searchParams.get('token') !== token) return send(res, 403, { error: 'Scan the QR code again' });
      let write = null;
      write = openStream(req, res, () => {
        phones.delete(write);
        tvs.forEach((t) => t.write('status', status()));
      });
      phones.add(write);
      write('status', status());
      if (snapshot) write('state', snapshot);
      tvs.forEach((t) => t.write('status', status()));
    },

    /** Phone: a button press, forwarded to the newest TV tab. */
    async 'POST command'(req, res, url) {
      if (url.searchParams.get('token') !== token) return send(res, 403, { error: 'Scan the QR code again' });
      const { cmd, id } = await readJson(req);
      if (!REMOTE_COMMANDS.includes(cmd)) return send(res, 400, { error: `Unknown command ${cmd}` });
      const tv = tvs[tvs.length - 1];
      if (!tv) return send(res, 409, { error: 'The game is not open on the TV' });
      tv.write('command', { cmd, id: String(id ?? '') });
      send(res, 200, { ok: true });
    },
  };

  return {
    name: 'takeover-dev-remote',
    apply: 'serve',
    config() {
      // Listen on the Wi-Fi address too, so phones can reach the dev server.
      return { server: { host: true } };
    },
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer.address();
        if (addr && typeof addr === 'object') port = addr.port;
      });
      server.middlewares.use('/__remote', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        const name = url.pathname.replace(/^\/+/, '');
        const handler = routes[`${req.method} ${name}`];
        if (!handler) return send(res, 404, { error: `Unknown endpoint ${req.method} ${name}` });
        try {
          await handler(req, res, url);
        } catch (err) {
          if (!res.headersSent) send(res, err.status ?? 500, { error: err.message });
        }
      });
    },
  };
}
