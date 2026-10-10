import { useEffect, useReducer, useState } from 'react';
import { initialState, reducer } from './game/reducer';
import { GAME_KEY, loadGame, saveJSON } from './game/storage';
import SetupScreen from './screens/SetupScreen';
import BoardScreen from './screens/BoardScreen';
import DuelScreen from './screens/DuelScreen';
import WinnerScreen from './screens/WinnerScreen';
import EditorScreen from './screens/EditorScreen';
import ReviewScreen from './screens/ReviewScreen';
import RemoteScreen from './screens/RemoteScreen';
import { RemoteBridge } from './game/remoteBridge';

/** Side views on top of the game, kept in the URL hash so a refresh returns to them. */
type View =
  | { name: 'game' }
  | { name: 'editor' }
  | { name: 'review'; packId: string }
  /** the phone page opened from the QR code */
  | { name: 'remote'; token: string };

function viewFromHash(): View {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  if (h === 'editor') return { name: 'editor' };
  const m = /^review\/([a-z0-9-]+)$/.exec(h);
  if (m) return { name: 'review', packId: m[1] };
  const r = /^remote\/([a-f0-9]+)$/.exec(h);
  if (r) return { name: 'remote', token: r[1] };
  return { name: 'game' };
}

function hashFor(v: View): string {
  if (v.name === 'game') return '';
  if (v.name === 'editor') return '#editor';
  if (v.name === 'remote') return `#remote/${v.token}`;
  return `#review/${v.packId}`;
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

  // The phone only renders the remote; it has no game of its own.
  if (view.name === 'remote')
    return (
      <div className="arena-bg flex h-full flex-col">
        <RemoteScreen token={view.token} />
      </div>
    );

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

  return (
    <RemoteBridge state={state}>
      <div className="arena-bg flex h-full flex-col">{screen}</div>
    </RemoteBridge>
  );
}
