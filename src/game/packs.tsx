import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadJSON, PACKS_KEY, saveJSON } from './storage';
import type { Lang, Pack, Question } from './types';

/** Fewer questions than this and a duel may run dry. */
export const MIN_SAFE_QUESTIONS = 30;

/** Validates and normalises unknown JSON into a Pack, or returns null. */
export function normalizePack(raw: unknown): Pack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  const lang: Lang = r.lang === 'en' ? 'en' : 'he';
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : newPackId();

  // Picture mode: an `images` array takes precedence over text questions.
  // Each entry is { "url": "...", "answer": "..." }. Entries missing either field are skipped.
  if (Array.isArray(r.images)) {
    const questions: Question[] = [];
    for (const item of r.images) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const url = typeof o.url === 'string' ? o.url.trim() : '';
      const answer =
        typeof o.answer === 'string' ? o.answer.trim() : typeof o.answer === 'number' ? String(o.answer) : '';
      if (!url || !answer) continue;
      questions.push({ prompt: '', image: url, answer });
    }
    return { id, name: r.name.trim(), lang, questions };
  }

  if (!Array.isArray(r.questions)) return null;
  const questions: Question[] = [];
  for (const q of r.questions) {
    if (!q || typeof q !== 'object') continue;
    const o = q as Record<string, unknown>;
    const prompt = typeof o.prompt === 'string' ? o.prompt : '';
    const answer = typeof o.answer === 'string' ? o.answer : typeof o.answer === 'number' ? String(o.answer) : '';
    const image = typeof o.image === 'string' && o.image ? o.image : undefined;
    if (!answer || (!prompt && !image)) continue;
    questions.push(image ? { prompt, image, answer } : { prompt, answer });
  }
  return { id, name: r.name.trim(), lang, questions };
}

export function newPackId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Strips app-only fields for export. */
export function exportPack(p: Pack): string {
  const { id, name, lang, questions } = p;
  return JSON.stringify({ id, name, lang, questions }, null, 2);
}

interface PacksApi {
  packs: Pack[];
  loading: boolean;
  get: (id: string) => Pack | undefined;
  /** Returns false when browser storage is full. */
  save: (p: Pack) => boolean;
  remove: (id: string) => void;
  /** Re-fetches the built-in packs from /packs (after the review page edits one). */
  reload: () => void;
}

const Ctx = createContext<PacksApi | null>(null);

export function PacksProvider({ children }: { children: ReactNode }) {
  const [builtIn, setBuiltIn] = useState<Pack[]>([]);
  const [custom, setCustom] = useState<Pack[]>(() => loadJSON<Pack[]>(PACKS_KEY) ?? []);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    const base = import.meta.env.BASE_URL;
    const opts: RequestInit = { cache: 'no-store' };
    fetch(`${base}packs/index.json`, opts)
      .then((r) => r.json() as Promise<string[]>)
      .then((files) =>
        Promise.all(
          files.map((f) =>
            fetch(`${base}packs/${f}`, opts)
              .then((r) => r.json())
              .then(normalizePack)
              .catch(() => null),
          ),
        ),
      )
      .then((list) => alive && setBuiltIn(list.filter((p): p is Pack => !!p)))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [version]);

  const packs = useMemo(() => {
    const customIds = new Set(custom.map((p) => p.id));
    return [...builtIn.filter((p) => !customIds.has(p.id)), ...custom.map((p) => ({ ...p, custom: true }))];
  }, [builtIn, custom]);

  const get = useCallback((id: string) => packs.find((p) => p.id === id), [packs]);

  const save = useCallback(
    (p: Pack) => {
      const clean = { ...p, custom: true };
      const next = custom.some((c) => c.id === p.id)
        ? custom.map((c) => (c.id === p.id ? clean : c))
        : [...custom, clean];
      if (!saveJSON(PACKS_KEY, next)) return false;
      setCustom(next);
      return true;
    },
    [custom],
  );

  const remove = useCallback(
    (id: string) => {
      const next = custom.filter((c) => c.id !== id);
      saveJSON(PACKS_KEY, next);
      setCustom(next);
    },
    [custom],
  );

  const value = useMemo(
    () => ({ packs, loading, get, save, remove, reload }),
    [packs, loading, get, save, remove, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePacks(): PacksApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePacks outside provider');
  return v;
}
