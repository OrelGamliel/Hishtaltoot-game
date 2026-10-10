#!/usr/bin/env node
// Builds a picture pack from a list of answers.
//
//   npm run build-pack -- --answers fruits.txt --source wikipedia-he --id he-fruits --name "פירות"
//   npm run build-pack fruits.txt wikipedia-he he-fruits          (positional form)
//
// For each answer it finds an image, downloads it to public/packs/<id>/, and writes
// public/packs/<id>.json. Answers with no image are printed and saved to <answers>.missing.txt.
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOURCES,
  cleanImages,
  formatPack,
  imageBaseName,
  isValidPackId,
  packFileFromUrl,
  packFileUrl,
  parseAnswers,
} from './lib/pack-utils.mjs';
import { downloadImage, resolveImage } from './lib/sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = join(ROOT, 'public', 'packs');

const USAGE = `Usage:
  npm run build-pack -- --id <pack-id> --source <source>                    (fill the pack's empty pictures)
  npm run build-pack -- --answers <file> --source <source> --id <pack-id>   (answers from a text file)
  npm run build-pack <file> <source> <pack-id>

Without --answers, the pack's own answers are used and only entries with no picture are looked up.

Sources: ${SOURCES.join(', ')}

Options:
  --name <text>     Pack name shown in the game (default: existing name, else the id)
  --lang he|en      Pack language (default: existing, else "en" for wikipedia-en, otherwise "he")
  --force           Re-download images even for answers that already have one
  --delay <ms>      Pause between lookups (default 1000)

Answers file: one answer per line. Lines starting with # are ignored.
Use "answer | search term" to look up a different term, e.g.  ישראל | il  (flagcdn)
or  תפוח | Apple  (wikipedia-en). With a wikipedia source, "en:" or "he:" in front of the search
term switches language for that line, e.g.  מכבש שום | en:Garlic press The tmdb source needs TMDB_API_KEY in the environment.`;

function parseArgs(argv) {
  const opts = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') opts.force = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2);
      opts[k] = inline ?? argv[++i];
    } else opts.positional.push(a);
  }
  const [answers, source, id] = opts.positional;
  return {
    help: opts.help,
    answers: opts.answers ?? answers,
    source: opts.source ?? source,
    id: opts.id ?? opts.category ?? id,
    name: opts.name,
    lang: opts.lang,
    force: !!opts.force,
    delay: Number(opts.delay ?? 1000),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.source || !args.id) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  if (!SOURCES.includes(args.source)) throw new Error(`Unknown source "${args.source}". Use one of: ${SOURCES.join(', ')}`);
  if (!isValidPackId(args.id)) throw new Error(`Invalid pack id "${args.id}". Use lowercase letters, digits and dashes, e.g. he-fruits`);
  if (args.lang && !['he', 'en'].includes(args.lang)) throw new Error('--lang must be he or en');

  const packPath = join(PACKS, `${args.id}.json`);
  const dir = join(PACKS, args.id);
  const existing = existsSync(packPath) ? JSON.parse(await readFile(packPath, 'utf8')) : null;

  // Without --answers, the pack's own answer list is used (entries that already have a picture are kept).
  let answers;
  if (args.answers) {
    answers = parseAnswers(await readFile(resolve(args.answers), 'utf8'));
    if (answers.length === 0) throw new Error(`No answers found in ${args.answers}`);
  } else {
    if (!existing) throw new Error(`Pack ${args.id} does not exist yet. Pass --answers <file> to create it.`);
    answers = parseAnswers(cleanImages(existing.images).map((i) => String(i.answer ?? '')).join('\n'));
    if (answers.length === 0) throw new Error(`Pack ${args.id} has no answers. Pass --answers <file>.`);
  }
  const lang = args.lang ?? existing?.lang ?? (args.source === 'wikipedia-en' ? 'en' : 'he');
  const name = args.name ?? existing?.name ?? args.id;
  const previous = new Map(cleanImages(existing?.images).map((i) => [i.answer, i]));

  console.log(`Building "${name}" (${args.id}) from ${answers.length} answers via ${args.source}\n`);

  const images = [];
  const missing = [];
  let fetched = 0;
  let kept = 0;
  let fatal = false;
  for (const [n, { answer, query }] of answers.entries()) {
    const label = `[${String(n + 1).padStart(String(answers.length).length)}/${answers.length}] ${answer}`;
    const prev = previous.get(answer);
    const prevFile = prev && packFileFromUrl(args.id, prev.url);
    // Keep an entry that already has a picture: a remote URL, or a local file that still exists.
    if (prev?.url && !args.force && (!prevFile || existsSync(join(dir, prevFile)))) {
      images.push(prev);
      kept++;
      console.log(`${label}  = kept`);
      continue;
    }
    // Answers without a picture stay in the pack with an empty url (the game skips them),
    // so the answer list is never lost and a later run or the review page can fill them in.
    // With --force, a failed lookup falls back to the picture the answer already had.
    const keepEmpty = () => {
      missing.push(answer);
      images.push({ url: prev?.url ?? '', answer });
    };
    if (fatal) {
      keepEmpty();
      continue;
    }
    try {
      const remote = await resolveImage(args.source, query, { lang });
      if (!remote) {
        keepEmpty();
        console.log(`${label}  ✗ no image found${query !== answer ? ` (searched "${query}")` : ''}`);
      } else {
        const file = await downloadImage(remote, dir, imageBaseName(answer));
        images.push({ url: packFileUrl(args.id, file), answer });
        fetched++;
        console.log(`${label}  ✓ ${file}`);
      }
    } catch (err) {
      keepEmpty();
      console.log(`${label}  ✗ ${err.message}`);
      if (/TMDB_API_KEY/.test(err.message)) fatal = true; // no point trying the rest
    }
    if (args.delay > 0) await sleep(args.delay);
  }

  // Entries added by hand (e.g. in the review page) that are not in the answers file are kept.
  const listed = new Set(answers.map((a) => a.answer));
  const extra = cleanImages(existing?.images).filter((i) => !listed.has(i.answer));
  images.push(...extra);

  const { images: _old, ...rest } = existing ?? {};
  const pack = { id: args.id, name, lang, ...rest, images };
  pack.id = args.id;
  pack.name = name;
  pack.lang = lang;
  await writeFile(packPath, formatPack(pack));

  // Register the pack so the app loads it.
  const indexPath = join(PACKS, 'index.json');
  const before = existsSync(indexPath) ? JSON.parse(await readFile(indexPath, 'utf8')) : [];
  // Also drop entries whose pack file was deleted by hand.
  const index = before.filter((f) => existsSync(join(PACKS, f)));
  for (const f of before) if (!index.includes(f)) console.log(`Removed missing ${f} from index.json`);
  if (!index.includes(`${args.id}.json`)) index.push(`${args.id}.json`);
  if (JSON.stringify(index) !== JSON.stringify(before)) await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');

  const missingPath = args.answers ? `${resolve(args.answers)}.missing.txt` : null;
  if (missingPath) {
    if (missing.length) await writeFile(missingPath, missing.join('\n') + '\n');
    else await rm(missingPath, { force: true });
  }

  const withPicture = images.filter((i) => i.url).length;
  console.log(`\nWrote ${packPath}`);
  console.log(
    `  ${withPicture}/${images.length} answers have a picture (${fetched} downloaded, ${kept} kept${extra.length ? `, ${extra.length} extra kept from the pack` : ''})`,
  );
  if (missing.length) {
    console.log(`\nNo image for ${missing.length} answer(s), left in the pack with an empty url:`);
    for (const m of missing) console.log(`  - ${m}`);
    if (missingPath) console.log(`\nSaved to ${missingPath}`);
    console.log('Tip: use "answer | other search term" in an answers file, try another --source, or fix them in the app review page.');
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
