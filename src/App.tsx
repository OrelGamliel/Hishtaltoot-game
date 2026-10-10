import { useEffect, useReducer, useState } from 'react';
import { initialState, reducer } from './game/reducer';
import { GAME_KEY, loadGame, saveJSON } from './game/storage';
import SetupScreen from './screens/SetupScreen';
import BoardScreen from './screens/BoardScreen';
import DuelScreen from './screens/DuelScreen';
import WinnerScreen from './screens/WinnerScreen';
import EditorScreen from './screens/EditorScreen';
import ReviewScreen from './screens/ReviewScreen';

/** Side views on top of the game, kept in the URL hash so a refresh returns to them. */
type View = { name: 'game' } | { name: 'editor' } | { name: 'review'; packId: string };

function viewFromHash(): View {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  if (h === 'editor') return { name: 'editor' };
  const m = /^review\/([a-z0-9-]+)$/.exec(h);
  if (m) return { name: 'review', packId: m[1] };
  return { name: 'game' };
}

function hashFor(v: View): string {
  return v.name === 'game' ? '' : v.name === 'editor' ? '#editor' : `#review/${v.packId}`;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadGame() ?? initialState());
  const [view, setView] = useState<View>(viewFromHash);

  // Persist every change so a refresh never loses the game.
  useEffect(() => {
    saveJSON(GAME_KEY, state);
  }, [state]);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v: View) => {
    const hash = hashFor(v);
    if (hash) window.location.hash = hash;
    else history.replaceState(null, '', window.location.pathname + window.location.search);
    setView(v);
  };

  let screen;
  if (view.name === 'review') screen = <ReviewScreen packId={view.packId} onBack={() => go({ name: 'editor' })} />;
  else if (view.name === 'editor')
    screen = (
      <EditorScreen onBack={() => go({ name: 'game' })} onReview={(packId) => go({ name: 'review', packId })} />
    );
  else if (state.phase === 'setup')
    screen = <SetupScreen dispatch={dispatch} openEditor={() => go({ name: 'editor' })} />;
  else if (state.phase === 'duel') screen = <DuelScreen state={state} dispatch={dispatch} />;
  else if (state.phase === 'winner') screen = <WinnerScreen state={state} dispatch={dispatch} />;
  else screen = <BoardScreen state={state} dispatch={dispatch} />;

  return <div className="arena-bg flex h-full flex-col">{screen}</div>;
}
