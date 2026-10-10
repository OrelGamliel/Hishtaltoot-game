// Vite dev-server plugin: a small local API so the in-app review page can edit packs on disk.
// Only active during `npm run dev` (apply: 'serve'); the static build has no write access.
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SOURCES, formatPack, imageBaseName, isValidPackId, packFileFromUrl, packFileUrl } from './pack-utils.mjs';
import { downloadImage, resolveImage, saveDataUrl } from './sources.mjs';

const MAX_BODY = 25 * 1024 * 1024;

const MIME = {
  json: 'application/json; charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function devPackApi({ root }) {
  const packsDir = join(root, 'public', 'packs');

  const requireId = (id) => {
    if (!isValidPackId(id)) throw Object.assign(new Error(`Invalid pack id "${id}"`), { status: 400 });
    return id;
  };
  // Unique per call so a replaced picture never shows a stale cached image.
  const freshName = (answer) => imageBaseName(String(answer ?? ''), `${Date.now()}-${Math.random()}`);

  const routes = {
    async ping() {
      return { ok: true, sources: SOURCES, tmdb: !!process.env.TMDB_API_KEY };
    },

    /** Overwrites public/packs/<id>.json with the given pack object. */
    async save({ id, pack }) {
      requireId(id);
      if (!pack || typeof pack !== 'object' || !Array.isArray(pack.images)) throw new Error('Pack must have an images array');
      const path = join(packsDir, `${id}.json`);
      if (!existsSync(path)) throw Object.assign(new Error('Pack not found'), { status: 404 });
      await writeFile(path, formatPack({ ...pack, id }));
      return { ok: true };
    },

    /** Finds an image with one of the build-pack sources and downloads it into the pack folder. */
    async search({ id, answer, source, query, lang }) {
      requireId(id);
      if (!SOURCES.includes(source)) throw new Error(`Unknown source "${source}"`);
      const remote = await resolveImage(source, String(query || answer || ''), { lang });
      if (!remote) throw Object.assign(new Error('No image found'), { status: 404 });
      const file = await downloadImage(remote, join(packsDir, id), freshName(answer));
      return { url: packFileUrl(id, file) };
    },

    /** Downloads an image from a URL the host pasted (the server avoids browser CORS limits). */
    async fetchUrl({ id, answer, url }) {
      requireId(id);
      if (!/^https?:\/\//i.test(String(url))) throw new Error('Enter an http(s) image URL');
      const file = await downloadImage(url, join(packsDir, id), freshName(answer));
      return { url: packFileUrl(id, file) };
    },

    /** Saves an uploaded image (data URL) into the pack folder. */
    async upload({ id, answer, dataUrl }) {
      requireId(id);
      const file = await saveDataUrl(dataUrl, join(packsDir, id), freshName(answer));
      return { url: packFileUrl(id, file) };
    },

    /** Deletes a local image of the pack, unless the pack still references it. */
    async deleteFile({ id, url }) {
      requireId(id);
      const file = packFileFromUrl(id, url);
      if (!file) return { ok: true, skipped: true };
      const packPath = join(packsDir, `${id}.json`);
      if (existsSync(packPath)) {
        const pack = JSON.parse(await readFile(packPath, 'utf8'));
        if ((pack.images ?? []).some((i) => i?.url === url)) return { ok: true, skipped: true };
      }
      await rm(join(packsDir, id, file), { force: true });
      return { ok: true };
    },
  };

  return {
    name: 'takeover-dev-pack-api',
    apply: 'serve',
    config() {
      // Saving packs shouldn't trigger a full page reload in the middle of a review.
      return { server: { watch: { ignored: ['**/public/packs/**'] } } };
    },
    configureServer(server) {
      // public/packs is excluded from the file watcher (see config above), so Vite never learns
      // about images or packs created while it runs. Serve that folder straight from disk instead.
      server.middlewares.use('/packs', async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        let rel;
        try {
          rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        } catch {
          return next();
        }
        const parts = rel.split('/');
        const safe = parts.length <= 2 && parts.every((p) => /^[a-zA-Z0-9._-]+$/.test(p) && !p.startsWith('.'));
        const path = join(packsDir, ...parts);
        if (!safe || !existsSync(path)) return next();
        try {
          const bytes = await readFile(path);
          const ext = rel.split('.').pop()?.toLowerCase();
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          res.end(req.method === 'HEAD' ? undefined : bytes);
        } catch {
          next();
        }
      });

      server.middlewares.use('/__packs', async (req, res) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0];
        const handler = Object.hasOwn(routes, name) ? routes[name] : null;
        if (!handler) return send(res, 404, { error: `Unknown endpoint ${name}` });
        if (name !== 'ping' && req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
        try {
          const body = name === 'ping' ? {} : await readBody(req);
          send(res, 200, await handler(body));
        } catch (err) {
          send(res, err.status ?? 500, { error: err.message });
        }
      });
    },
  };
}
