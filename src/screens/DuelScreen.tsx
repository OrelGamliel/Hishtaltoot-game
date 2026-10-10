import { useCallback, useEffect, useRef, useState, type CSSProperties, type Dispatch } from 'react';
import { useI18n } from '../i18n/i18n';
import { usePacks } from '../game/packs';
import { otherSide, type Action } from '../game/reducer';
import type { GameState, Player, Side } from '../game/types';
import { textOn } from '../game/colors';
import { sfx } from '../game/sounds';
import { GlobalControls, Modal } from '../components/ui';

const TICK_MS = 100;

function formatClock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return s.toFixed(1);
  return String(Math.ceil(s));
}

export default function DuelScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<Action> }) {
  const { t } = useI18n();
  const { get, loading } = usePacks();
  const duel = state.duel!;
  const pack = get(duel.categoryId);
  const count = pack?.questions.length ?? 0;
  const player = (side: Side): Player =>
    state.players.find((p) => p.id === (side === 'challenger' ? duel.challengerId : duel.defenderId))!;
  const question = pack && duel.questionIndex !== null ? pack.questions[duel.questionIndex] : null;
  const revealed = pack && duel.reveal ? pack.questions[duel.reveal.questionIndex] : null;

  // ---- chess clock ----
  const last = useRef(performance.now());
  const flush = useCallback(() => {
    const now = performance.now();
    const elapsed = now - last.current;
    last.current = now;
    if (elapsed > 0) dispatch({ type: 'TICK', elapsed });
  }, [dispatch]);

  useEffect(() => {
    if (duel.status !== 'running') return;
    last.current = performance.now();
    const id = window.setInterval(flush, TICK_MS);
    return () => clearInterval(id);
  }, [duel.status, flush]);

  // Out of questions mid-duel: stop the clock so nobody is penalised while the host decides.
  useEffect(() => {
    if (duel.status === 'running' && duel.questionIndex === null && !loading) {
      flush();
      dispatch({ type: 'PAUSE' });
    }
  }, [duel.status, duel.questionIndex, loading, flush, dispatch]);

  // Ticking in the last 10 seconds of the active clock.
  const activeSecs = Math.ceil(duel.remaining[duel.active] / 1000);
  const prevSecs = useRef(activeSecs);
  useEffect(() => {
    if (duel.status === 'running' && activeSecs !== prevSecs.current && activeSecs <= 10 && activeSecs > 0) sfx.urgentTick();
    prevSecs.current = activeSecs;
  }, [activeSecs, duel.status]);

  // Result sound + a short guard so a late "correct" press doesn't skip the result.
  const [overAt, setOverAt] = useState<number | null>(duel.status === 'over' ? 0 : null);
  useEffect(() => {
    if (duel.status === 'over' && overAt === null) {
      sfx.buzzer();
      window.setTimeout(() => sfx.win(), 500);
      setOverAt(performance.now());
    }
  }, [duel.status, overAt]);

  const act = useCallback(
    (kind: 'correct' | 'pass' | 'pause' | 'resume' | 'begin' | 'continue' | 'cancel') => {
      const rand = Math.random();
      switch (kind) {
        case 'begin':
          if (duel.status === 'ready') dispatch({ type: 'DUEL_BEGIN', questionCount: count, rand });
          break;
        case 'cancel':
          dispatch({ type: 'CANCEL_DUEL' });
          break;
        case 'correct':
          if (duel.status !== 'running') return;
          flush();
          sfx.correct();
          dispatch({ type: 'CORRECT', questionCount: count, rand });
          break;
        case 'pass':
          if (duel.status !== 'running') return;
          flush();
          sfx.pass();
          dispatch({ type: 'PASS', questionCount: count, rand });
          break;
        case 'pause':
          if (duel.status !== 'running') return;
          flush();
          dispatch({ type: 'PAUSE' });
          break;
        case 'resume':
          dispatch({ type: 'RESUME' });
          break;
        case 'continue':
          if (duel.status === 'over' && overAt !== null && performance.now() - overAt > 1200) dispatch({ type: 'RESOLVE_DUEL' });
          break;
      }
    },
    [duel.status, count, flush, dispatch, overAt],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const correctKey = e.code === 'Space' || e.key === 'ArrowRight';
      const s = duel.status;
      let handled = true;
      if (s === 'ready') {
        if (correctKey || e.key === 'Enter') act('begin');
        else if (e.key === 'Escape') act('cancel');
        else handled = false;
      } else if (s === 'running') {
        if (correctKey) act('correct');
        else if (e.code === 'KeyP') act('pass');
        else if (e.key === 'Escape') act('pause');
        else handled = false;
      } else if (s === 'paused') {
        if (e.key === 'Escape' || (e.code === 'Space' && duel.questionIndex !== null)) act('resume');
        else handled = false;
      } else if (s === 'over') {
        if (correctKey || e.key === 'Enter') act('continue');
        else handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [act, duel.status, duel.questionIndex]);

  const winner = duel.winner ? player(duel.winner) : null;
  const loser = duel.winner ? player(otherSide(duel.winner)) : null;
  const loserTiles = loser ? state.tiles.filter((x) => x.ownerId === loser.id).length : 0;

  const panel = (side: Side) => {
    const p = player(side);
    const isActive = duel.active === side && duel.status !== 'over';
    const ms = duel.remaining[side];
    const low = ms < 10_000 && duel.status === 'running' && isActive;
    return (
      <div
        className={`card relative flex flex-col items-center justify-center gap-2 overflow-hidden p-4 transition-all duration-300 lg:p-6 ${
          isActive ? 'side-active' : 'opacity-50 saturate-50'
        }`}
        style={{ '--side-color': p.color } as CSSProperties}
      >
        <div className="absolute inset-x-0 top-0 h-2" style={{ background: p.color }} />
        <div
          className="max-w-full truncate rounded-xl px-4 py-1 text-[clamp(1.4rem,3vw,3rem)] font-black"
          style={{ background: p.color, color: textOn(p.color) }}
          dir="auto"
        >
          {p.name}
        </div>
        <div
          className={`clock-digits font-black ${low ? 'danger-blink' : ''}`}
          style={{ fontSize: 'clamp(4rem, 11vw, 12rem)', color: ms <= 0 ? '#ff4d4d' : undefined }}
          dir="ltr"
        >
          {formatClock(ms)}
        </div>
        <div className="text-sm text-white/60">
          {t('stats', { correct: duel.correct[side], passes: duel.passes[side] })}
        </div>
        {isActive && duel.status === 'running' && <div className="text-3xl text-white/80">🎤</div>}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-3">
        <div className="text-sm font-bold tracking-widest text-white/50 uppercase">
          {player('challenger').name} {t('vs')} {player('defender').name}
        </div>
        <div className="rounded-full border border-accent-2/50 bg-accent-2/10 px-5 py-1.5 text-xl font-black text-accent-2" dir="auto">
          {pack?.name ?? '?'}
        </div>
        <GlobalControls />
      </header>

      <main className="grid min-h-0 flex-1 gap-4 px-4 pb-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        {panel('challenger')}

        <section className="card relative flex min-h-[40vh] flex-col items-center justify-center gap-4 overflow-hidden p-6 text-center">
          {duel.reveal && revealed?.answer && (
            <div
              key={duel.reveal.seq}
              className={`reveal-flash absolute inset-x-4 top-4 rounded-xl px-4 py-2 text-[clamp(1rem,2vw,1.8rem)] font-bold ${
                duel.reveal.kind === 'correct' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {duel.reveal.kind === 'correct' ? '✓ ' : '↷ '}
              {t('correctAnswer', { answer: revealed.answer })}
            </div>
          )}

          {duel.status === 'ready' && (
            <div className="pop-in space-y-4">
              <p className="text-[clamp(1.5rem,3vw,3rem)] font-black">
                {t('duelFirst', { name: player('challenger').name })}
              </p>
              <button className="btn btn-primary px-10 py-4 text-2xl" onClick={() => act('begin')}>
                ▶ {t('duelReady')}
              </button>
              <div>
                <button className="btn btn-ghost" onClick={() => act('cancel')}>
                  {t('cancel')}
                </button>
              </div>
              {!pack && !loading && <p className="text-amber-300">{t('missingPack')}</p>}
            </div>
          )}

          {duel.status !== 'ready' && question && (
            <div key={duel.questionIndex} className="question-in flex w-full flex-col items-center gap-4 pt-10">
              {question.image && (
                <img
                  src={question.image}
                  alt=""
                  className={`${question.prompt ? 'max-h-[42vh]' : 'max-h-[62vh]'} max-w-full rounded-xl object-contain shadow-2xl`}
                />
              )}
              {question.prompt && (
                <p className="text-[clamp(1.8rem,4.2vw,4.5rem)] leading-tight font-black" dir="auto">
                  {question.prompt}
                </p>
              )}
            </div>
          )}

          {duel.status !== 'ready' && !question && duel.status !== 'over' && (
            <p className="text-2xl text-amber-300">{pack ? t('outOfQuestions') : t('missingPack')}</p>
          )}
        </section>

        {panel('defender')}
      </main>

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 px-4 py-3">
        <button onMouseDown={(e) => e.preventDefault()} className="btn btn-ghost border-emerald-500/50 px-6 text-lg text-emerald-300" disabled={duel.status !== 'running'} onClick={() => act('correct')}>
          ✓ {t('correct')}
        </button>
        <button onMouseDown={(e) => e.preventDefault()} className="btn btn-ghost border-amber-500/50 px-6 text-lg text-amber-300" disabled={duel.status !== 'running'} onClick={() => act('pass')}>
          ↷ {t('pass')}
        </button>
        <button onMouseDown={(e) => e.preventDefault()} className="btn btn-ghost px-6 text-lg" disabled={duel.status !== 'running'} onClick={() => act('pause')}>
          ⏸ {t('pause')}
        </button>
        <span className="text-sm text-white/40">{t('keysHelp')}</span>
      </footer>

      {duel.status === 'paused' && (
        <Modal>
          <h2 className="mb-2 text-center text-4xl font-black">⏸ {t('paused')}</h2>
          {duel.questionIndex === null && (
            <div className="mb-4 text-center">
              <p className="mb-2 text-amber-300">{pack ? t('outOfQuestions') : t('missingPack')}</p>
              {pack && count > 0 && (
                <button
                  className="btn btn-ghost"
                  onClick={() => dispatch({ type: 'RECYCLE_QUESTIONS', questionCount: count, rand: Math.random() })}
                >
                  ♻ {t('recycle')}
                </button>
              )}
            </div>
          )}
          <div className="grid gap-2">
            <button className="btn btn-primary py-3 text-xl" disabled={duel.questionIndex === null} onClick={() => act('resume')}>
              ▶ {t('resume')}
            </button>
            {(['challenger', 'defender'] as Side[]).map((side) => (
              <button key={side} className="btn btn-ghost" onClick={() => dispatch({ type: 'FORCE_WIN', side })}>
                🏳 <span>{t('declareWinner', { name: player(side).name })}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {duel.status === 'over' && winner && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="pop-in text-center">
            {question?.answer && (
              <p className="mb-6 text-xl text-white/70">
                {t('correctAnswer', { answer: question.answer })}
              </p>
            )}
            <div
              className="mx-auto inline-block rounded-3xl px-12 py-6 text-[clamp(2.5rem,7vw,7rem)] font-black shadow-2xl"
              style={{ background: winner.color, color: textOn(winner.color), boxShadow: `0 0 120px -10px ${winner.color}` }}
            >
              {t('wins', { name: winner.name })}
            </div>
            <p className="mt-4 text-2xl text-white/80">{t('takesTerritory', { n: loserTiles })}</p>
            <button className="btn btn-primary mt-8 px-10 py-4 text-2xl" onClick={() => act('continue')}>
              {t('continue')} ⏎
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
