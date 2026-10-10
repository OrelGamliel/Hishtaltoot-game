import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import { useI18n } from '../i18n/i18n';
import { usePacks } from '../game/packs';
import { adjacentOpponents, duelCategory, remainingPlayers } from '../game/grid';
import type { Action } from '../game/reducer';
import type { GameState, Player, Tile } from '../game/types';
import { textOn } from '../game/colors';
import { sfx } from '../game/sounds';
import Board from '../components/Board';
import HistoryLog from '../components/HistoryLog';
import { ConfirmButton, Modal, TopBar } from '../components/ui';

/** Delays (ms) between randomizer steps: fast at first, slowing to a stop. */
function spinSchedule(): number[] {
  const steps = 22 + Math.floor(Math.random() * 6);
  return Array.from({ length: steps }, (_, i) => 55 + Math.pow(i / steps, 3) * 520);
}

export default function BoardScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<Action> }) {
  const { t } = useI18n();
  const { get } = usePacks();
  const { tiles, players, settings, turn } = state;
  const { rows, cols } = settings;
  const alive = useMemo(() => remainingPlayers(players), [players]);
  const active = players.find((p) => p.id === turn.activePlayerId) ?? null;
  const targets = useMemo(
    () => (active && turn.stage === 'choose' ? adjacentOpponents(tiles, active.id, rows, cols) : []),
    [active, turn.stage, tiles, rows, cols],
  );
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const [pending, setPending] = useState<Player | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const spin = useCallback(() => {
    if (spinning || turn.stage !== 'randomize' || alive.length < 2) return;
    const chosen = alive[Math.floor(Math.random() * alive.length)];
    const schedule = spinSchedule();
    setSpinning(true);
    setLanded(false);
    let at = 0;
    let prev = '';
    schedule.forEach((delay, i) => {
      at += delay;
      const last = i === schedule.length - 1;
      timers.current.push(
        window.setTimeout(() => {
          let pick = chosen.id;
          if (!last) {
            const pool = alive.filter((p) => p.id !== prev);
            pick = pool[Math.floor(Math.random() * pool.length)].id;
          }
          prev = pick;
          setSpotlight(pick);
          if (last) {
            setLanded(true);
            sfx.land();
          } else sfx.spin();
        }, at),
      );
    });
    timers.current.push(
      window.setTimeout(() => {
        setSpinning(false);
        setLanded(false);
        setSpotlight(null);
        dispatch({ type: 'RANDOM_PICKED', playerId: chosen.id });
      }, at + 1400),
    );
  }, [spinning, turn.stage, alive, dispatch]);

  // Host shortcut: Space / Enter spins the randomizer.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (pending || e.repeat) return;
      if ((e.code === 'Space' || e.key === 'Enter') && turn.stage === 'randomize') {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return; // let the focused button handle it
        e.preventDefault();
        spin();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [spin, turn.stage, pending]);

  const onTileClick = (tile: Tile) => {
    if (turn.stage !== 'choose' || !targets.includes(tile.ownerId)) return;
    setPending(players.find((p) => p.id === tile.ownerId) ?? null);
  };

  const spotPlayer = players.find((p) => p.id === spotlight);
  const tileCount = (id: string) => tiles.filter((x) => x.ownerId === id).length;
  const pendingCategory =
    pending && active ? duelCategory(tiles, players, active.id, pending.id, rows, cols) : null;

  return (
    <>
      <TopBar>
        {settings.prize && (
          <span className="hidden rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm font-bold text-gold md:inline">
            🏆 {settings.prize}
          </span>
        )}
        <ConfirmButton onConfirm={() => dispatch({ type: 'NEW_GAME' })}>{t('newGame')}</ConfirmButton>
      </TopBar>

      <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
        {/* Board */}
        <section className="relative min-h-[50vh] flex-1">
          <Board
            tiles={tiles}
            players={players}
            rows={rows}
            cols={cols}
            activeId={turn.stage !== 'randomize' ? active?.id : null}
            targetIds={targets}
            spotlightId={spotlight}
            dimOthers={spinning || turn.stage === 'choose'}
            onTileClick={onTileClick}
          />
          {spinning && spotPlayer && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
              <div
                key={spotPlayer.id + String(landed)}
                className={`spin-name rounded-2xl px-8 py-3 text-4xl font-black shadow-2xl md:text-6xl ${landed ? 'pop-in' : ''}`}
                style={{ background: spotPlayer.color, color: textOn(spotPlayer.color) }}
              >
                <span dir="auto">{spotPlayer.name}</span>
              </div>
            </div>
          )}
        </section>

        {/* Side panel */}
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80 xl:w-96">
          <div className="card p-5">
            {turn.stage === 'randomize' && (
              <div className="text-center">
                <p className="mb-3 text-white/60">{t('playersLeft', { n: alive.length })}</p>
                <button className="btn btn-primary w-full py-5 text-3xl" onClick={spin} disabled={spinning}>
                  🎲 {spinning ? t('spinning') : t('spin')}
                </button>
              </div>
            )}
            {turn.stage === 'choose' && active && (
              <div>
                <p className="text-2xl font-black">
                  <span style={{ color: active.color }}>●</span> {t('pickOpponent', { name: active.name })}
                </p>
                <p className="mt-1 text-sm text-white/60">{t('pickHint')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {targets.map((id) => {
                    const p = players.find((x) => x.id === id)!;
                    return (
                      <button
                        key={id}
                        className="btn px-3 py-1.5"
                        style={{ background: p.color, color: textOn(p.color) }}
                        onClick={() => setPending(p)}
                      >
                        <span dir="auto">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
                <button className="btn btn-ghost mt-4 w-full" onClick={() => dispatch({ type: 'RESPIN' })}>
                  🎲 {t('respin')}
                </button>
              </div>
            )}
            {turn.stage === 'postWin' && active && (
              <div>
                <p className="mb-4 text-2xl font-black">
                  <span style={{ color: active.color }}>★</span> {t('winnerChooses', { name: active.name })}
                </p>
                <div className="grid gap-2">
                  <button
                    className="btn btn-primary py-3 text-xl"
                    onClick={() => dispatch({ type: 'DUEL_AGAIN' })}
                    disabled={adjacentOpponents(tiles, active.id, rows, cols).length === 0}
                  >
                    ⚔ {t('duelAgain')}
                  </button>
                  <button className="btn btn-ghost py-3 text-xl" onClick={() => dispatch({ type: 'TO_RANDOMIZER' })}>
                    🎲 {t('backToRandomizer')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card p-4">
            <ul className="grid grid-cols-2 gap-1.5 text-sm">
              {[...players]
                .sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || tileCount(b.id) - tileCount(a.id))
                .map((p) => (
                  <li
                    key={p.id}
                    className={`flex items-center gap-2 truncate rounded-md px-2 py-1 ${p.eliminated ? 'opacity-35' : 'bg-ink/40'}`}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
                    <span dir="auto" className={`flex-1 truncate ${p.eliminated ? 'line-through' : 'font-bold'}`}>
                      {p.name}
                    </span>
                    <span className="text-white/50">{p.eliminated ? t('eliminated') : tileCount(p.id)}</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="card flex min-h-0 flex-1 flex-col p-4">
            <HistoryLog state={state} dispatch={dispatch} />
          </div>
        </aside>
      </main>

      {pending && active && (
        <Modal onClose={() => setPending(null)}>
          <h2 className="mb-5 text-center text-sm font-bold tracking-widest text-white/50 uppercase">{t('challenge')}</h2>
          <div className="flex items-center justify-center gap-4">
            <div className="rounded-xl px-5 py-3 text-2xl font-black" style={{ background: active.color, color: textOn(active.color) }}>
              <span dir="auto">{active.name}</span>
            </div>
            <span className="text-xl font-black text-white/60">{t('vs')}</span>
            <div className="rounded-xl px-5 py-3 text-2xl font-black" style={{ background: pending.color, color: textOn(pending.color) }}>
              <span dir="auto">{pending.name}</span>
            </div>
          </div>
          <p className="mt-5 text-center text-xl">
            {t('duelIn', { category: (pendingCategory && get(pendingCategory)?.name) || '?' })}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button className="btn btn-ghost" onClick={() => setPending(null)}>
              {t('cancel')}
            </button>
            <button
              autoFocus
              className="btn btn-primary px-8 text-xl"
              onClick={() => {
                dispatch({ type: 'START_DUEL', defenderId: pending.id });
                setPending(null);
              }}
            >
              ⚔ {t('startDuel')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
