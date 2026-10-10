// Pure helpers shared by the build-pack script and the dev-server pack API.
import { createHash } from 'node:crypto';

export const SOURCES = ['wikipedia-he', 'wikipedia-en', 'flagcdn', 'tmdb', 'itunes'];

/** Pack ids double as folder names, so keep them filesystem- and URL-safe. */
export function isValidPackId(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
}

/**
 * Parses an answers file. One answer per line; blank lines and lines starting with # are ignored.
 * "answer | search query" uses a different term for the lookup than the answer shown in the game,
 * e.g. "ישראל | il" for flagcdn or "תפוח | Apple" for wikipedia-en.
 */
export function parseAnswers(text) {
  const out = [];
  const seen = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const bar = line.indexOf('|');
    const answer = (bar === -1 ? line : line.slice(0, bar)).trim();
    const query = (bar === -1 ? answer : line.slice(bar + 1).trim()) || answer;
    if (!answer || seen.has(answer)) continue;
    seen.add(answer);
    out.push({ answer, query });
  }
  return out;
}

/** Stable short file name for an answer, so re-runs reuse the same file. */
export function imageBaseName(answer, salt = '') {
  return createHash('sha1').update(answer + salt).digest('hex').slice(0, 10);
}

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

export function extForContentType(type) {
  const t = String(type || '').split(';')[0].trim().toLowerCase();
  return EXT_BY_TYPE[t] ?? null;
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Finds a flagcdn country code. `codes` maps code -> name (one or more languages merged).
 * Accepts the code itself ("il", "gb-eng"), an exact name, or a unique partial match.
 */
export function matchFlagCode(query, codes) {
  const q = norm(query);
  if (!q) return null;
  if (codes[q]) return q;
  const compact = q.replace(/ /g, '-');
  if (codes[compact]) return compact;
  const entries = Object.entries(codes).map(([code, name]) => [code, norm(name)]);
  const exact = entries.find(([, name]) => name === q);
  if (exact) return exact[0];
  const partial = entries.filter(([, name]) => name.startsWith(q) || name.includes(` ${q}`) || q.includes(name));
  // US states and subdivisions ("us-ca", "gb-sct") are less likely; prefer plain 2-letter codes.
  partial.sort((a, b) => a[0].length - b[0].length);
  return partial[0]?.[0] ?? null;
}

const compact = (x) => JSON.stringify(x, null, 1).replace(/\n\s*/g, ' ');

/**
 * Formats a pack like the hand-written ones: top-level keys pretty, one array item per line.
 */
export function formatPack(pack) {
  const keys = Object.keys(pack);
  const lines = ['{'];
  keys.forEach((k, i) => {
    const v = pack[k];
    const comma = i < keys.length - 1 ? ',' : '';
    if (Array.isArray(v) && v.every((x) => x && typeof x === 'object')) {
      if (v.length === 0) {
        lines.push(`  ${JSON.stringify(k)}: []${comma}`);
      } else {
        lines.push(`  ${JSON.stringify(k)}: [`);
        v.forEach((x, j) => lines.push(`    ${compact(x)}${j < v.length - 1 ? ',' : ''}`));
        lines.push(`  ]${comma}`);
      }
    } else {
      lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
    }
  });
  lines.push('}');
  return lines.join('\n') + '\n';
}

/** Drops blank template entries ({ url: "", answer: "" }). */
export function cleanImages(images) {
  return (Array.isArray(images) ? images : []).filter(
    (i) => i && typeof i === 'object' && (String(i.url ?? '').trim() || String(i.answer ?? '').trim()),
  );
}

/** Public URL for a file inside a pack folder. */
export function packFileUrl(id, file) {
  return `/packs/${id}/${file}`;
}

/** Inverse of packFileUrl, or null when the URL is not a local file of that pack. */
export function packFileFromUrl(id, url) {
  const prefix = `/packs/${id}/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  const file = url.slice(prefix.length);
  return /^[a-zA-Z0-9._-]+$/.test(file) && !file.startsWith('.') ? file : null;
}
