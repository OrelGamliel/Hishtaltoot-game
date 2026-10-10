// Image resolvers for the pack builder. Each returns a remote image URL for a query, or null.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extForContentType, matchFlagCode } from './pack-utils.mjs';

// Wikimedia asks API clients to identify themselves.
const UA = 'TakeoverPackBuilder/1.0 (local trivia party game builder)';
const THUMB = 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ATTEMPTS = 8;

/** How long to wait before retry `i` (1-based): the server's Retry-After if given, else 2s, 4s, 8s… capped at 60s. */
function backoff(i, res) {
  const after = Number(res?.headers.get('retry-after'));
  const base = Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * 2 ** (i - 1);
  return Math.min(base, 60_000) + Math.random() * 500;
}

/**
 * fetch() with retries for rate limits (429), server errors (5xx) and network hiccups.
 * Wikimedia rate-limits both its API and image downloads, sometimes for a minute or more.
 * `check(res, body)` returns { ok: true, value } or { retry: boolean, error }.
 */
async function fetchRetry(url, headers, read, check) {
  for (let i = 1; ; i++) {
    let res;
    let outcome;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
      outcome = check(res, await read(res));
    } catch (err) {
      outcome = { retry: true, error: err };
    }
    if (outcome.ok) return outcome.value;
    if (!outcome.retry || i >= ATTEMPTS) throw outcome.error;
    await sleep(backoff(i, res));
  }
}

const retryableStatus = (s) => s === 429 || s >= 500;

/** GET JSON. Wikipedia sometimes answers "You are making too many requests" as plain text with a 200. */
function getJson(url, headers = {}) {
  return fetchRetry(
    url,
    { Accept: 'application/json', ...headers },
    (res) => res.text(),
    (res, text) => {
      if (!res.ok) return { retry: retryableStatus(res.status), error: new Error(`${res.status} ${res.statusText} for ${url}`) };
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch {
        return { retry: /too many requests/i.test(text), error: new Error(`Not JSON from ${url}: ${text.slice(0, 80)}`) };
      }
    },
  );
}

/** GET binary image data and its content type. */
function getImage(url) {
  return fetchRetry(
    url,
    {},
    (res) => res.arrayBuffer(),
    (res, buf) => {
      if (!res.ok) return { retry: retryableStatus(res.status), error: new Error(`${res.status} ${res.statusText} downloading ${url}`) };
      return { ok: true, value: { bytes: Buffer.from(buf), type: res.headers.get('content-type') } };
    },
  );
}

// ---------- Wikipedia ----------
async function wikipedia(lang, query) {
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  const base = `?action=query&format=json&formatversion=2&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=${THUMB}`;
  // 1. exact title (follows redirects)
  const exact = await getJson(`${api}${base}&titles=${encodeURIComponent(query)}`);
  const page = exact?.query?.pages?.[0];
  if (page && !page.missing && page.thumbnail?.source) return page.thumbnail.source;
  // 2. best search hit that has an image
  const search = await getJson(
    `${api}${base}&generator=search&gsrlimit=5&gsrnamespace=0&gsrsearch=${encodeURIComponent(query)}`,
  );
  const pages = (search?.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.find((p) => p.thumbnail?.source)?.thumbnail.source ?? null;
}

// ---------- flagcdn ----------
/** code -> country name tables, English first, then Hebrew when flagcdn offers it. */
let flagTables = null;
async function loadFlagTables() {
  if (flagTables) return flagTables;
  flagTables = [];
  for (const lang of ['en', 'he']) {
    try {
      flagTables.push(await getJson(`https://flagcdn.com/${lang}/codes.json`));
    } catch {
      /* language not offered by flagcdn */
    }
  }
  return flagTables;
}

/** Everyday Hebrew names where flagcdn uses a formal name (or a partial match would pick wrongly). */
const HE_FLAG_ALIASES = {
  בריטניה: 'gb',
  'הממלכה המאוחדת': 'gb',
  אנגליה: 'gb-eng',
  סקוטלנד: 'gb-sct',
  ויילס: 'gb-wls',
  וויילס: 'gb-wls',
  הולנד: 'nl',
  'דרום קוריאה': 'kr',
  'צפון קוריאה': 'kp',
  סין: 'cn',
  'ארה"ב': 'us',
  טייוואן: 'tw',
};

async function flagcdn(query) {
  const alias = HE_FLAG_ALIASES[query.trim()];
  if (alias) return `https://flagcdn.com/w640/${alias}.png`;
  for (const table of await loadFlagTables()) {
    const code = matchFlagCode(query, table);
    if (code) return `https://flagcdn.com/w640/${code}.png`;
  }
  return null;
}

// ---------- TMDB ----------
async function tmdb(query, lang) {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('Set TMDB_API_KEY (a v3 API key or a v4 read access token) to use the tmdb source.');
  const bearer = key.startsWith('eyJ');
  const params = new URLSearchParams({ query, include_adult: 'false', language: lang === 'en' ? 'en-US' : 'he-IL' });
  if (!bearer) params.set('api_key', key);
  const data = await getJson(
    `https://api.themoviedb.org/3/search/multi?${params}`,
    bearer ? { Authorization: `Bearer ${key}` } : {},
  );
  const hit = (data.results ?? []).find((r) => r.poster_path || r.profile_path);
  const path = hit?.poster_path ?? hit?.profile_path;
  return path ? `https://image.tmdb.org/t/p/w780${path}` : null;
}

// ---------- iTunes ----------
async function itunes(query) {
  // iTunes has no artist photos, so this returns album artwork (good for singers, bands, albums).
  const params = new URLSearchParams({ term: query, entity: 'album', limit: '5', country: 'IL' });
  const data = await getJson(`https://itunes.apple.com/search?${params}`);
  const art = data.results?.find((r) => r.artworkUrl100)?.artworkUrl100;
  return art ? art.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null;
}

/** Resolves a remote image URL for `query` from `source`, or null when nothing is found. */
export async function resolveImage(source, query, { lang = 'he' } = {}) {
  switch (source) {
    case 'wikipedia-he':
    case 'wikipedia-en': {
      // A query can switch language for one answer: "en:Garlic press" or "he:שום".
      const m = /^(he|en):\s*(.+)$/.exec(query);
      if (m) return wikipedia(m[1], m[2]);
      return wikipedia(source === 'wikipedia-he' ? 'he' : 'en', query);
    }
    case 'flagcdn':
      return flagcdn(query);
    case 'tmdb':
      return tmdb(query, lang);
    case 'itunes':
      return itunes(query);
    default:
      throw new Error(`Unknown source "${source}"`);
  }
}

/** Downloads an image into `dir` as `<baseName>.<ext>` and returns the file name. */
export async function downloadImage(url, dir, baseName) {
  const { bytes, type } = await getImage(url);
  const ext = extForContentType(type);
  if (!ext) throw new Error(`Not an image (${type}): ${url}`);
  await mkdir(dir, { recursive: true });
  const file = `${baseName}.${ext}`;
  await writeFile(join(dir, file), bytes);
  return file;
}

/** Saves a data: URL (from an upload in the review page) into `dir`. */
export async function saveDataUrl(dataUrl, dir, baseName) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(dataUrl));
  if (!m) throw new Error('Invalid data URL');
  const ext = extForContentType(m[1]);
  if (!ext) throw new Error(`Not an image type: ${m[1]}`);
  const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
  await mkdir(dir, { recursive: true });
  const file = `${baseName}.${ext}`;
  await writeFile(join(dir, file), bytes);
  return file;
}
