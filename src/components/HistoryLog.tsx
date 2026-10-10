import type { Dispatch } from 'react';
import { useI18n } from '../i18n/i18n';
import { usePacks } from '../game/packs';
import type { Action } from '../game/reducer';
import type { GameState } from '../game/types';
import { ConfirmButton } from './ui';

export default function HistoryLog({ state, dispatch }: { state: GameState; dispatch: Dispatch<Action> }) {
  const { t } = useI18n();
  const { get } = usePacks();
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?';
  const color = (id: string) => state.players.find((p) => p.id === id)?.color ?? '#888';
  const canUndo = state.undo.length > 0;

  return (
    <div className="flex min-h-0 flex-col">
      <h3 className="mb-2 text-sm font-bold tracking-wide text-white/50 uppercase">{t('history')}</h3>
      {state.history.length === 0 ? (
        <p className="text-sm text-white/40">{t('noHistory')}</p>
      ) : (
        <ol className="min-h-0 flex-1 space-y-1.5 overflow-auto text-sm">
          {[...state.history].reverse().map((h) => {
            const vars = {
              winner: name(h.winnerId),
              loser: name(h.loserId),
              category: get(h.categoryId)?.name ?? '?',
              tiles: h.tilesTaken,
            };
            return (
              <li
                key={h.id}
                className={`flex items-start gap-2 rounded-lg bg-ink/50 px-2 py-1.5 ${h.undone ? 'opacity-40 line-through' : ''}`}
              >
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color(h.winnerId) }} />
                <span className="flex-1">
                  {t(h.kind === 'swap' ? 'historySwap' : 'historyLine', vars)}
                  {h.undone && <em className="ms-1 not-italic text-white/60">({t('undone')})</em>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {canUndo && (
        <div className="mt-3 flex flex-col gap-2">
          <ConfirmButton className="btn btn-ghost w-full py-1.5 text-sm" onConfirm={() => dispatch({ type: 'UNDO' })}>
            ↶ {t('undo')}
          </ConfirmButton>
          <ConfirmButton
            className="btn btn-ghost w-full py-1.5 text-sm"
            onConfirm={() => dispatch({ type: 'SWAP_LAST_RESULT' })}
          >
            ⇄ {t('swapResult')}
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
