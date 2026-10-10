import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Lang } from '../game/types';
import { loadJSON, saveJSON } from '../game/storage';
import { translations, type TKey } from './translations';

type Vars = Record<string, string | number>;

interface I18n {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Vars) => string;
}

const Ctx = createContext<I18n | null>(null);
const KEY = 'takeover.lang';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => loadJSON<Lang>(KEY) ?? 'he');
  const dir = lang === 'he' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = `${translations[lang].appName}`;
    saveJSON(KEY, lang);
  }, [lang, dir]);

  const value = useMemo<I18n>(
    () => ({
      lang,
      dir,
      setLang,
      t: (key, vars) => {
        let s: string = translations[lang][key] ?? translations.en[key] ?? key;
        if (!vars) return s;
        // Unicode first-strong isolates keep e.g. a Hebrew name inside an English sentence from reordering it.
        for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(`⁨${v}⁩`);
        return s;
      },
    }),
    [lang, dir],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
