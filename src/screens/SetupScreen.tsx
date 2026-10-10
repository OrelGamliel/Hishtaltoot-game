import { useEffect, useMemo, useState, type Dispatch } from 'react';
import { useI18n } from '../i18n/i18n';
import { MIN_SAFE_QUESTIONS, newPackId, usePacks } from '../game/packs';
import { bestShape, gridShapes, shuffle } from '../game/grid';
import { DEFAULT_SETTINGS, type Action } from '../game/reducer';
import { loadJSON, saveJSON, SETUP_KEY } from '../game/storage';
import { playerColor, textOn } from '../game/colors';
import type { Pack, Player, Settings } from '../game/types';
import { Modal, TopBar } from '../components/ui';
import PackForm from '../components/PackForm';

interface DraftPlayer {
  id: string;
  name: string;
  categoryId: string;
}

interface Draft {
  players: DraftPlayer[];
  /** player ids in tile order (row-major) */
  order: string[];
  settings: Settings;
}

const pid = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function freshDraft(): Draft {
  const players = Array.from({ length: 4 }, () => ({ id: pid(), name: '', categoryId: '' }));
  const [rows, cols] = bestShape(players.length);
  return { players, order: shuffle(players.map((p) => p.id)), settings: { ...DEFAULT_SETTINGS, rows, cols } };
}

export default function SetupScreen({
  dispatch,
  openEditor,
}: {
  dispatch: Dispatch<Action>;
  openEditor: () => void;
}) {
  const { t, lang } = useI18n();
  const { packs, get, save } = usePacks();
  const [draft, setDraft] = useState<Draft>(() => loadJSON<Draft>(SETUP_KEY) ?? freshDraft());
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    saveJSON(SETUP_KEY, draft);
  }, [draft]);

  const n = draft.players.length;
  const shapes = useMemo(() => gridShapes(n), [n]);
  const { rows, cols } = draft.settings;
  const colorOf = (id: string) => playerColor(draft.players.findIndex((p) => p.id === id));

  const update = (fn: (d: Draft) => Draft) => {
    setError('');
    setDraft(fn);
  };

  const setPlayers = (players: DraftPlayer[], order: string[]) =>
    update((d) => {
      const fits = d.settings.rows * d.settings.cols === players.length;
      const [r, c] = fits ? [d.settings.rows, d.settings.cols] : bestShape(Math.max(players.length, 1));
      return { ...d, players, order, settings: { ...d.settings, rows: r, cols: c } };
    });

  const addPlayer = () => {
    const p = { id: pid(), name: '', categoryId: '' };
    // drop the new player on a random tile
    const order = [...draft.order];
    order.splice(Math.floor(Math.random() * (order.length + 1)), 0, p.id);
    setPlayers([...draft.players, p], order);
  };

  const removePlayer = (id: string) =>
    setPlayers(
      draft.players.filter((p) => p.id !== id),
      draft.order.filter((x) => x !== id),
    );

  const patchPlayer = (id: string, patch: Partial<DraftPlayer>) =>
    update((d) => ({ ...d, players: d.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const setSetting = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    update((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));

  const swap = (a: number, b: number) =>
    update((d) => {
      const order = [...d.order];
      [order[a], order[b]] = [order[b], order[a]];
      return { ...d, order };
    });

  const start = () => {
    const names = draft.players.map((p) => p.name.trim());
    if (n < 2) return setError(t('errMinPlayers'));
    if (names.some((x) => !x)) return setError(t('errNames'));
    if (new Set(names.map((x) => x.toLowerCase())).size !== names.length) return setError(t('errDuplicateNames'));
    if (draft.players.some((p) => !get(p.categoryId))) return setError(t('errCategories'));
    const byId = new Map(draft.players.map((p, i) => [p.id, { p, i }]));
    const players: Player[] = draft.order.map((id) => {
      const { p, i } = byId.get(id)!;
      return { id: p.id, name: p.name.trim(), categoryId: p.categoryId, color: playerColor(i), eliminated: false };
    });
    dispatch({
      type: 'START_GAME',
      settings: {
        ...draft.settings,
        duelSeconds: Math.max(5, draft.settings.duelSeconds || 45),
        passPenalty: Math.max(0, draft.settings.passPenalty || 0),
      },
      players,
    });
  };

  const sortedPacks = useMemo(
    () => [...packs].sort((a, b) => (a.lang === lang ? -1 : 0) - (b.lang === lang ? -1 : 0) || a.name.localeCompare(b.name)),
    [packs, lang],
  );

  return (
    <>
      <TopBar>
        <button className="btn btn-ghost" onClick={openEditor}>
          📚 {t('categoryEditor')}
        </button>
      </TopBar>
      <main className="flex-1 overflow-auto px-5 py-6">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.25fr_1fr]">
          {/* Players */}
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-black">
                {t('players')} <span className="text-white/40">({n})</span>
              </h2>
              <button className="btn btn-ghost" onClick={addPlayer}>
                ＋ {t('addPlayer')}
              </button>
            </div>
            <ul className="space-y-3">
              {draft.players.map((p, i) => {
                const pack = get(p.categoryId);
                const low = pack && pack.questions.length < MIN_SAFE_QUESTIONS;
                return (
                  <li key={p.id} className="rounded-xl border border-line/70 bg-ink/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-black"
                        style={{ background: playerColor(i), color: textOn(playerColor(i)) }}
                      >
                        {i + 1}
                      </span>
                      <input
                        className="input min-w-36 flex-1"
                        value={p.name}
                        placeholder={t('playerNamePlaceholder', { n: i + 1 })}
                        aria-label={t('playerName')}
                        onChange={(e) => patchPlayer(p.id, { name: e.target.value })}
                      />
                      <select
                        className="input min-w-44 flex-1"
                        value={pack ? p.categoryId : ''}
                        aria-label={t('category')}
                        onChange={(e) => patchPlayer(p.id, { categoryId: e.target.value })}
                      >
                        <option value="">{t('chooseCategory')}</option>
                        {sortedPacks.map((pk) => (
                          <option key={pk.id} value={pk.id}>
                            {pk.name} ({pk.questions.length})
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-ghost px-3" onClick={() => setCreatingFor(p.id)} title={t('newCategory')}>
                        ＋ {t('newCategory')}
                      </button>
                      <button
                        className="btn btn-ghost px-3 text-white/60"
                        onClick={() => removePlayer(p.id)}
                        aria-label={t('removePlayer')}
                        title={t('removePlayer')}
                      >
                        ✕
                      </button>
                    </div>
                    {low && (
                      <p className="mt-2 text-sm text-amber-300">
                        ⚠ {t('lowQuestionsWarning', { n: pack.questions.length })}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="space-y-6">
            {/* Grid + seating */}
            <section className="card p-5">
              <h2 className="mb-1 text-2xl font-black">{t('gridSize')}</h2>
              <p className="mb-3 text-sm text-white/50">{t('gridHint')}</p>
              {n < 2 ? (
                <p className="text-amber-300">{t('noGridForCount')}</p>
              ) : (
                <div className="mb-4 flex flex-wrap gap-2">
                  {shapes.map(([r, c]) => (
                    <button
                      key={`${r}x${c}`}
                      className={`btn ${r === rows && c === cols ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => update((d) => ({ ...d, settings: { ...d.settings, rows: r, cols: c } }))}
                    >
                      <span dir="ltr">
                        {r}×{c}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {n >= 2 && rows * cols === n && (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-bold">{t('arrangement')}</h3>
                    <button className="btn btn-ghost px-3 py-1" onClick={() => update((d) => ({ ...d, order: shuffle(d.order) }))}>
                      🔀 {t('shuffle')}
                    </button>
                  </div>
                  <p className="mb-2 text-sm text-white/50">{t('arrangementHint')}</p>
                  <div
                    dir="ltr"
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {draft.order.map((id, idx) => {
                      const p = draft.players.find((x) => x.id === id);
                      const i = draft.players.findIndex((x) => x.id === id);
                      const color = colorOf(id);
                      return (
                        <div
                          key={id}
                          draggable
                          onDragStart={() => setDragFrom(idx)}
                          onDragEnd={() => setDragFrom(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => dragFrom !== null && dragFrom !== idx && swap(dragFrom, idx)}
                          className={`flex aspect-[4/3] cursor-grab flex-col items-center justify-center rounded-lg p-1 text-center transition active:cursor-grabbing ${
                            dragFrom === idx ? 'scale-95 opacity-50' : 'hover:scale-[1.03]'
                          }`}
                          style={{ background: color, color: textOn(color) }}
                        >
                          <span dir="auto" className="w-full truncate text-sm font-black">
                            {p?.name || t('playerNamePlaceholder', { n: i + 1 })}
                          </span>
                          <span dir="auto" className="w-full truncate text-[0.65rem] opacity-75">
                            {get(p?.categoryId ?? '')?.name ?? '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* Settings */}
            <section className="card space-y-4 p-5">
              <h2 className="text-2xl font-black">{t('settings')}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">{t('duelSeconds')}</span>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    className="input"
                    value={draft.settings.duelSeconds}
                    onChange={(e) => setSetting('duelSeconds', Number(e.target.value))}
                  />
                </label>
                <label>
                  <span className="label">{t('passPenalty')}</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    className="input"
                    value={draft.settings.passPenalty}
                    onChange={(e) => setSetting('passPenalty', Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="block">
                <span className="label">{t('prize')}</span>
                <input
                  className="input"
                  value={draft.settings.prize}
                  placeholder={t('prizePlaceholder')}
                  onChange={(e) => setSetting('prize', e.target.value)}
                />
              </label>
            </section>

            {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-200">{error}</p>}
            <button
              className="btn btn-primary w-full py-4 text-2xl"
              onClick={start}
              disabled={n < 2 || rows * cols !== n}
            >
              ▶ {t('startGame')}
            </button>
          </div>
        </div>
      </main>

      {creatingFor && (
        <Modal wide onClose={() => setCreatingFor(null)}>
          <PackForm
            initial={{ id: newPackId(), name: '', lang, questions: [] }}
            onCancel={() => setCreatingFor(null)}
            onSave={(pack: Pack) => {
              if (!save(pack)) return false;
              patchPlayer(creatingFor, { categoryId: pack.id });
              setCreatingFor(null);
              return true;
            }}
          />
        </Modal>
      )}
    </>
  );
}
