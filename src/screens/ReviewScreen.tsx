import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/i18n';
import { usePacks } from '../game/packs';
import { ConfirmButton, Modal, TopBar } from '../components/ui';
import { fileToDataUrl } from '../components/PackForm';

interface Picture {
  url: string;
  answer: string;
}

type RawPack = Record<string, unknown> & { name?: string; lang?: string; images?: unknown };

interface DevApi {
  sources: string[];
  tmdb: boolean;
}

/** Calls the dev-server pack API (scripts/lib/dev-pack-api.mjs). */
async function api<T = { url: string }>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`/__packs/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `${res.status}`);
  return data as T;
}

function picturesOf(raw: RawPack | null): Picture[] {
  if (!raw || !Array.isArray(raw.images)) return [];
  return raw.images
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({ url: String(i.url ?? ''), answer: String(i.answer ?? '') }))
    .filter((i) => i.url || i.answer);
}

export default function ReviewScreen({ packId, onBack }: { packId: string; onBack: () => void }) {
  const { t } = useI18n();
  const { reload } = usePacks();
  const [raw, setRaw] = useState<RawPack | null>(null);
  const [error, setError] = useState('');
  const [dev, setDev] = useState<DevApi | null | false>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  /** index being replaced, or 'add' */
  const [editing, setEditing] = useState<number | 'add' | null>(null);

  const load = useCallback(() => {
    fetch(`/packs/${packId}.json`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<RawPack>;
      })
      .then(setRaw)
      .catch((e) => setError(String(e.message ?? e)));
  }, [packId]);

  useEffect(load, [load]);
  useEffect(() => {
    fetch('/__packs/ping')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDev(d?.ok ? { sources: d.sources, tmdb: d.tmdb } : false))
      .catch(() => setDev(false));
  }, []);

  const pictures = picturesOf(raw);
  const lang = raw?.lang === 'en' ? 'en' : 'he';

  /** Writes the pack to disk, then removes image files no longer used. */
  const persist = async (next: Picture[], removedUrls: string[] = []) => {
    if (!raw) return;
    setError('');
    const pack = { ...raw, images: next };
    try {
      await api('save', { id: packId, pack });
      setRaw(pack);
      for (const url of removedUrls) if (!next.some((p) => p.url === url)) await api('deleteFile', { id: packId, url });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const shown = pictures
    .map((p, i) => ({ ...p, i }))
    .filter((p) => !filter.trim() || p.answer.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <>
      <TopBar>
        <button className="btn btn-ghost" onClick={onBack}>
          ← {t('back')}
        </button>
      </TopBar>
      <main className="flex-1 overflow-auto px-5 py-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="me-auto text-3xl font-black">
              {t('reviewTitle', { name: raw?.name ?? packId })}{' '}
              <span className="text-lg font-bold text-white/40">{t('picturesCount', { n: pictures.length })}</span>
            </h1>
            <div className="w-48">
              <input
                className="input"
                placeholder={t('filterPictures')}
                aria-label={t('filterPictures')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            {dev && (
              <button className="btn btn-primary" onClick={() => setEditing('add')}>
                ＋ {t('addPicture')}
              </button>
            )}
          </div>

          {dev === false && (
            <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">{t('reviewReadOnly')}</p>
          )}
          {error && <p className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-200">{error}</p>}
          {raw && pictures.length === 0 && <p className="text-white/50">{t('noPictures')}</p>}

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {shown.map((p) => (
              <li key={`${p.i}-${p.url}`} className="card flex flex-col overflow-hidden">
                <div className="relative flex aspect-square items-center justify-center bg-white/5">
                  <span className="absolute start-2 top-2 rounded-md bg-black/60 px-1.5 text-xs font-bold text-white/70">
                    {p.i + 1}
                  </span>
                  {p.url && !broken.has(p.url) ? (
                    <img
                      src={p.url}
                      alt={p.answer}
                      loading="lazy"
                      className="h-full w-full object-contain p-2"
                      onError={() => setBroken((b) => new Set(b).add(p.url))}
                    />
                  ) : p.url ? (
                    <span className="px-2 text-center text-sm text-red-300">⚠ {t('imageBroken')}</span>
                  ) : (
                    <span className="px-2 text-center text-sm text-white/40">🖼 {t('noPictureYet')}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2 p-2">
                  {dev ? (
                    <input
                      key={p.answer}
                      className="input py-1 text-center font-bold"
                      dir="auto"
                      defaultValue={p.answer}
                      aria-label={t('answer')}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== p.answer) void persist(pictures.map((x, j) => (j === p.i ? { ...x, answer: v } : x)));
                        else e.target.value = p.answer;
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  ) : (
                    <p className="truncate text-center font-bold" dir="auto">
                      {p.answer || '—'}
                    </p>
                  )}
                  {dev && (
                    <div className="flex gap-1">
                      <button className="btn btn-ghost flex-1 px-2 py-1 text-sm" onClick={() => setEditing(p.i)}>
                        ↻ {t('replace')}
                      </button>
                      <ConfirmButton
                        className="btn btn-danger px-2 py-1 text-sm"
                        onConfirm={() => void persist(pictures.filter((_, j) => j !== p.i), [p.url])}
                      >
                        {t('delete')}
                      </ConfirmButton>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {editing !== null && dev && (
        <Modal onClose={() => setEditing(null)} wide>
          <PictureForm
            packId={packId}
            lang={lang}
            dev={dev}
            initial={editing === 'add' ? null : pictures[editing]}
            onCancel={() => setEditing(null)}
            onDone={async (pic) => {
              if (editing === 'add') await persist([...pictures, pic]);
              else {
                const old = pictures[editing];
                await persist(
                  pictures.map((x, j) => (j === editing ? pic : x)),
                  old.url !== pic.url ? [old.url] : [],
                );
              }
              setBroken((b) => {
                const n = new Set(b);
                n.delete(pic.url);
                return n;
              });
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}

function PictureForm({
  packId,
  lang,
  dev,
  initial,
  onCancel,
  onDone,
}: {
  packId: string;
  lang: 'he' | 'en';
  dev: DevApi;
  initial: Picture | null;
  onCancel: () => void;
  onDone: (p: Picture) => Promise<void>;
}) {
  const { t } = useI18n();
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [tab, setTab] = useState<'search' | 'url' | 'upload'>('search');
  const [source, setSource] = useState(lang === 'en' ? 'wikipedia-en' : 'wikipedia-he');
  const [query, setQuery] = useState(initial?.answer ?? '');
  const [link, setLink] = useState('');
  /** a freshly downloaded image waiting for confirmation */
  const [candidate, setCandidate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A candidate that was fetched but not used is an orphan file; clean it up.
  const discard = (url: string | null) => {
    if (url) void api('deleteFile', { id: packId, url }).catch(() => {});
  };

  const run = async (fn: () => Promise<{ url: string }>) => {
    setBusy(true);
    setError('');
    try {
      const { url } = await fn();
      discard(candidate);
      setCandidate(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const a = answer.trim();
    if (!a) return setError(t('answerRequired'));
    const url = candidate ?? initial?.url;
    if (!url) return;
    setBusy(true);
    await onDone({ url, answer: a });
    setBusy(false);
  };

  const cancel = () => {
    discard(candidate);
    onCancel();
  };

  const preview = candidate ?? initial?.url ?? null;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black">{initial ? t('replaceTitle') : t('addTitle')}</h2>
      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <div className="space-y-4">
          <label className="block">
            <span className="label">{t('answer')}</span>
            <input className="input text-lg" dir="auto" value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus={!initial} />
          </label>

          <div className="flex rounded-xl border border-line p-1">
            {(['search', 'url', 'upload'] as const).map((k) => (
              <button
                key={k}
                className={`flex-1 rounded-lg px-3 py-1 text-sm font-bold ${tab === k ? 'bg-panel-2' : 'text-white/50'}`}
                onClick={() => setTab(k)}
              >
                {t(k === 'search' ? 'tabSearch' : k === 'url' ? 'tabUrl' : 'tabUpload')}
              </button>
            ))}
          </div>

          {tab === 'search' && (
            <form
              className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => api('search', { id: packId, answer, source, query: query || answer, lang }));
              }}
            >
              <select className="input" value={source} aria-label={t('source')} onChange={(e) => setSource(e.target.value)}>
                {dev.sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                className="input"
                dir="auto"
                placeholder={t('searchTerm')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="btn btn-ghost" disabled={busy}>
                🔍 {t('find')}
              </button>
              {source === 'tmdb' && !dev.tmdb && <p className="text-sm text-amber-300 sm:col-span-3">{t('tmdbNoKey')}</p>}
            </form>
          )}

          {tab === 'url' && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => api('fetchUrl', { id: packId, answer, url: link.trim() }));
              }}
            >
              <input className="input" dir="ltr" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
              <button className="btn btn-ghost" disabled={busy || !link.trim()}>
                ⬇ {t('find')}
              </button>
            </form>
          )}

          {tab === 'upload' && (
            <label className="btn btn-ghost w-full">
              🖼 {t('uploadImage')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  const dataUrl = await fileToDataUrl(f, 1200);
                  void run(() => api('upload', { id: packId, answer, dataUrl }));
                }}
              />
            </label>
          )}

          {busy && <p className="text-white/60">{t('working')}</p>}
          {error && <p className="text-red-300">{error}</p>}
        </div>

        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-line bg-white/5">
          {preview ? <img src={preview} alt="" className="h-full w-full object-contain p-2" /> : <span className="text-4xl opacity-30">🖼</span>}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <button className="btn btn-ghost" onClick={cancel}>
          {t('cancel')}
        </button>
        <button className="btn btn-primary" disabled={busy || !(candidate ?? initial?.url) || !answer.trim()} onClick={() => void confirm()}>
          {candidate ? t('use') : t('save')}
        </button>
      </div>
    </div>
  );
}
