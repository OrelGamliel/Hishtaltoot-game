import { useState } from 'react';
import { useI18n } from '../i18n/i18n';
import { MIN_SAFE_QUESTIONS } from '../game/packs';
import type { Lang, Pack, Question } from '../game/types';

/** Reads an image file and downscales it to keep localStorage usage small. */
export function fileToDataUrl(file: File, maxSide = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = String(reader.result);
      if (file.type === 'image/svg+xml' || file.type === 'image/gif') return resolve(src);
      const img = new Image();
      img.onerror = () => resolve(src);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const c = canvas.getContext('2d');
        if (!c) return resolve(src);
        c.drawImage(img, 0, 0, canvas.width, canvas.height);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(type, 0.82));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

const blank = (): Question => ({ prompt: '', answer: '' });

export default function PackForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Pack;
  /** return false if saving failed (storage full) */
  onSave: (p: Pack) => boolean;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial.name);
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [questions, setQuestions] = useState<Question[]>(initial.questions.length ? initial.questions : [blank()]);
  const [error, setError] = useState('');

  const patch = (i: number, q: Partial<Question>) =>
    setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, ...q } : x)));

  const valid = questions.filter((q) => q.answer.trim() && (q.prompt.trim() || q.image));

  const submit = () => {
    if (!name.trim()) return setError(t('categoryName'));
    const pack: Pack = {
      id: initial.id,
      name: name.trim(),
      lang,
      questions: valid.map((q) => {
        const out: Question = { prompt: q.prompt.trim(), answer: q.answer.trim() };
        if (q.image) out.image = q.image;
        return out;
      }),
    };
    if (!onSave(pack)) setError(t('storageFull'));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label>
          <span className="label">{t('categoryName')}</span>
          <input className="input text-lg" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className="label">{t('languageLabel')}</span>
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="he">עברית</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black">{t('questionsHeader', { n: valid.length })}</h3>
        {valid.length < MIN_SAFE_QUESTIONS && (
          <span className="text-sm text-amber-300">⚠ {t('lowQuestionsWarning', { n: valid.length })}</span>
        )}
      </div>

      <ol className="space-y-2">
        {questions.map((q, i) => (
          <li key={i} className="rounded-xl border border-line/70 bg-ink/40 p-3">
            <div className="flex gap-2">
              <span className="w-7 shrink-0 pt-2 text-center text-sm text-white/40">{i + 1}</span>
              <div className="grid flex-1 gap-2 md:grid-cols-[2fr_1fr]">
                <input
                  className="input"
                  dir="auto"
                  placeholder={t('prompt')}
                  value={q.prompt}
                  onChange={(e) => patch(i, { prompt: e.target.value })}
                />
                <input
                  className="input"
                  dir="auto"
                  placeholder={t('answer')}
                  value={q.answer}
                  onChange={(e) => patch(i, { answer: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                  {q.image ? (
                    <>
                      <img src={q.image} alt="" className="h-14 w-20 rounded-md object-cover" />
                      <button className="btn btn-ghost px-2 py-1 text-sm" onClick={() => patch(i, { image: undefined })}>
                        {t('removeImage')}
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        className="input flex-1 py-1 text-sm"
                        dir="ltr"
                        placeholder={t('imageUrl')}
                        onBlur={(e) => e.target.value.trim() && patch(i, { image: e.target.value.trim() })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) patch(i, { image: e.currentTarget.value.trim() });
                        }}
                      />
                      <label className="btn btn-ghost px-2 py-1 text-sm">
                        🖼 {t('uploadImage')}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) patch(i, { image: await fileToDataUrl(f) });
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
              <button
                className="btn btn-ghost h-9 px-2 text-white/50"
                aria-label={t('delete')}
                onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button className="btn btn-ghost w-full" onClick={() => setQuestions((qs) => [...qs, blank()])}>
        ＋ {t('addQuestion')}
      </button>

      {error && <p className="text-red-300">{error}</p>}
      <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2 border-t border-line bg-panel px-6 py-3">
        <button className="btn btn-ghost" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
          {t('save')}
        </button>
      </div>
    </div>
  );
}
