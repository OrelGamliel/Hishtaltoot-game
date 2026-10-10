import { useState } from 'react';
import { useI18n } from '../i18n/i18n';
import { exportPack, MIN_SAFE_QUESTIONS, newPackId, normalizePack, usePacks } from '../game/packs';
import type { Lang, Pack } from '../game/types';
import PackForm from '../components/PackForm';
import { ConfirmButton, Modal, TopBar } from '../components/ui';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) => s.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'category';

export default function EditorScreen({
  onBack,
  onReview,
}: {
  onBack: () => void;
  onReview: (packId: string) => void;
}) {
  const { t, lang } = useI18n();
  const { packs, save, remove } = usePacks();
  const [editing, setEditing] = useState<Pack | null>(null);
  const [filter, setFilter] = useState<Lang | 'all'>('all');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = packs
    .filter((p) => filter === 'all' || p.lang === filter)
    .sort((a, b) => Number(!!b.custom) - Number(!!a.custom) || a.name.localeCompare(b.name));

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      try {
        const pack = normalizePack(JSON.parse(await f.text()));
        if (!pack) throw new Error('invalid');
        // An imported pack never overwrites a built-in one silently.
        const clash = packs.find((p) => p.id === pack.id && !p.custom);
        const final = clash ? { ...pack, id: newPackId() } : pack;
        if (!save(final)) {
          setMessage({ ok: false, text: t('storageFull') });
          return;
        }
        setMessage({ ok: true, text: t('importOk', { name: final.name }) });
      } catch {
        setMessage({ ok: false, text: `${f.name}: ${t('importError')}` });
      }
    }
  };

  return (
    <>
      <TopBar>
        <button className="btn btn-ghost" onClick={onBack}>
          ← {t('back')}
        </button>
      </TopBar>
      <main className="flex-1 overflow-auto px-5 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <h1 className="me-auto text-3xl font-black">{t('editorTitle')}</h1>
            <div className="flex rounded-xl border border-line p-1">
              {(['all', 'he', 'en'] as const).map((f) => (
                <button
                  key={f}
                  className={`rounded-lg px-3 py-1 text-sm font-bold ${filter === f ? 'bg-panel-2' : 'text-white/50'}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? t('filterAll') : f === 'he' ? 'עברית' : 'English'}
                </button>
              ))}
            </div>
            <label className="btn btn-ghost">
              ⬆ {t('importJson')}
              <input
                type="file"
                accept="application/json,.json"
                multiple
                className="hidden"
                onChange={(e) => {
                  void importFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <button className="btn btn-primary" onClick={() => setEditing({ id: newPackId(), name: '', lang, questions: [] })}>
              ＋ {t('createCategory')}
            </button>
          </div>

          {message && (
            <p className={`mb-4 rounded-xl p-3 ${message.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
              {message.text}
            </p>
          )}

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => {
              const low = p.questions.length < MIN_SAFE_QUESTIONS;
              return (
                <li key={p.id} className="card flex flex-col gap-3 p-4">
                  <div className="flex items-start gap-2">
                    <h2 className="flex-1 text-xl font-black" dir="auto">
                      {p.name}
                    </h2>
                    <span className="rounded-md bg-ink/60 px-2 py-0.5 text-xs font-bold text-white/60">{p.lang.toUpperCase()}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-bold ${p.custom ? 'bg-accent/20 text-accent' : 'bg-accent-2/15 text-accent-2'}`}
                    >
                      {p.custom ? t('custom') : t('builtIn')}
                    </span>
                  </div>
                  <p className={low ? 'text-sm text-amber-300' : 'text-sm text-white/60'}>
                    {low ? `⚠ ${t('lowQuestionsWarning', { n: p.questions.length })}` : t('questionsCount', { n: p.questions.length })}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {!p.custom && (
                      <button className="btn btn-ghost px-3 py-1 text-sm" onClick={() => onReview(p.id)}>
                        🖼 {t('review')}
                      </button>
                    )}
                    {p.custom && (
                      <button className="btn btn-ghost px-3 py-1 text-sm" onClick={() => setEditing(p)}>
                        ✎ {t('edit')}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost px-3 py-1 text-sm"
                      title={p.custom ? undefined : t('builtInReadOnly')}
                      onClick={() => setEditing({ ...p, id: newPackId(), name: `${p.name} (2)`, custom: true })}
                    >
                      ⧉ {t('duplicate')}
                    </button>
                    <button className="btn btn-ghost px-3 py-1 text-sm" onClick={() => download(`${slug(p.name)}.json`, exportPack(p))}>
                      ⬇ {t('exportJson')}
                    </button>
                    {p.custom && (
                      <ConfirmButton className="btn btn-danger px-3 py-1 text-sm" onConfirm={() => remove(p.id)}>
                        {t('delete')}
                      </ConfirmButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>

      {editing && (
        <Modal wide onClose={() => setEditing(null)}>
          <PackForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(pack) => {
              if (!save(pack)) return false;
              setEditing(null);
              setMessage({ ok: true, text: `${t('saved')}: ${pack.name}` });
              return true;
            }}
          />
        </Modal>
      )}
    </>
  );
}
