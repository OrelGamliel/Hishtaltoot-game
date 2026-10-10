import { useEffect, type Dispatch } from 'react';
import confetti from 'canvas-confetti';
import { useI18n } from '../i18n/i18n';
import { boardOwner } from '../game/grid';
import type { Action } from '../game/reducer';
import type { GameState } from '../game/types';
import { textOn } from '../game/colors';
import { sfx } from '../game/sounds';
import Board from '../components/Board';
import HistoryLog from '../components/HistoryLog';
import { TopBar } from '../components/ui';

export default function WinnerScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<Action> }) {
  const { t } = useI18n();
  const ownerId = boardOwner(state.tiles);
  const champ = state.players.find((p) => p.id === ownerId);

  useEffect(() => {
    if (!champ) return;
    sfx.win();
    const colors = [champ.color, '#ffffff', '#facc15'];
    const end = Date.now() + 4000;
    let raf = 0;
    const frame = () => {
      confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) raf = requestAnimationFrame(frame);
    };
    confetti({ particleCount: 160, spread: 100, origin: { y: 0.45 }, colors });
    frame();
    return () => {
      cancelAnimationFrame(raf);
      confetti.reset();
    };
  }, [champ]);

  if (!champ) return null;

  return (
    <>
      <TopBar />
      <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
        <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <p className="text-2xl font-bold tracking-[0.3em] text-gold uppercase">👑 {t('champion')}</p>
          <div
            className="pop-in rounded-3xl px-14 py-8 text-[clamp(3rem,9vw,9rem)] leading-none font-black"
            style={{ background: champ.color, color: textOn(champ.color), boxShadow: `0 0 160px -10px ${champ.color}` }}
            dir="auto"
          >
            {champ.name}
          </div>
          <p className="text-2xl text-white/80">
            {t('ownsBoard', { name: champ.name })}
          </p>
          {state.settings.prize && (
            <p className="rounded-full border border-gold/50 bg-gold/10 px-6 py-2 text-2xl font-bold text-gold">
              🏆 {t('prizeIs', { prize: state.settings.prize })}
            </p>
          )}
          <div className="h-[28vh] w-full max-w-xl">
            <Board tiles={state.tiles} players={state.players} rows={state.settings.rows} cols={state.settings.cols} />
          </div>
          <button className="btn btn-primary px-10 py-4 text-2xl" onClick={() => dispatch({ type: 'NEW_GAME' })}>
            ↻ {t('playAgain')}
          </button>
        </section>
        <aside className="card flex max-h-full w-full flex-col p-4 lg:w-96">
          <HistoryLog state={state} dispatch={dispatch} />
        </aside>
      </main>
    </>
  );
}
