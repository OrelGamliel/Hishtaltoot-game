import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import { usePacks } from './packs';
import { buildSnapshot, REMOTE_EVENT, snapshotKey, type RemoteCommand } from './remote';
import type { GameState } from './types';

interface RemoteStatus {
  /** the dev-server relay is reachable (false in a static build or when opened via a LAN address) */
  available: boolean;
  phones: number;
}

const Ctx = createContext<RemoteStatus>({ available: false, phones: 0 });
export const useRemoteStatus = () => useContext(Ctx);

/** Lets screens react to phone button presses. */
export function useRemoteCommand(handler: (cmd: RemoteCommand) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h = (e: Event) => ref.current((e as CustomEvent<RemoteCommand>).detail);
    window.addEventListener(REMOTE_EVENT, h);
    return () => window.removeEventListener(REMOTE_EVENT, h);
  }, []);
}

/**
 * TV side of the phone remote: publishes a snapshot of the game to the dev-server relay and turns
 * commands from phones into window events. Does nothing when the relay is not there.
 */
export function RemoteBridge({ state, children }: { state: GameState; children: ReactNode }) {
  const { get } = usePacks();
  const { lang } = useI18n();
  const [status, setStatus] = useState<RemoteStatus>({ available: false, phones: 0 });

  // Connect to the relay's TV stream.
  useEffect(() => {
    let es: EventSource | null = null;
    let alive = true;
    fetch('/__remote/info', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (!alive || !info) return;
        setStatus({ available: true, phones: info.phones ?? 0 });
        es = new EventSource('/__remote/tv-events');
        es.addEventListener('status', (e) => {
          const s = JSON.parse((e as MessageEvent).data);
          setStatus({ available: true, phones: s.phones ?? 0 });
        });
        const seen = new Set<string>();
        es.addEventListener('command', (e) => {
          const { cmd, id } = JSON.parse((e as MessageEvent).data) as { cmd: RemoteCommand; id: string };
          if (id && seen.has(id)) return;
          if (id) seen.add(id);
          window.dispatchEvent(new CustomEvent(REMOTE_EVENT, { detail: cmd }));
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      es?.close();
    };
  }, []);

  // Publish snapshots: immediately when something meaningful changes, and once a second while a
  // clock runs so phones stay in sync (they animate the clock in between).
  const snapshot = useMemo(() => buildSnapshot(state, get, lang), [state, get, lang]);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const lastKey = useRef('');
  const publish = () => {
    lastKey.current = snapshotKey(latest.current);
    void fetch('/__remote/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(latest.current),
    }).catch(() => {});
  };

  useEffect(() => {
    if (status.available && snapshotKey(snapshot) !== lastKey.current) publish();
  }, [snapshot, status.available]);

  const running = snapshot.duel?.status === 'running';
  useEffect(() => {
    if (!status.available || !running) return;
    const id = window.setInterval(publish, 1000);
    return () => clearInterval(id);
  }, [status.available, running]);

  // A phone that connects gets the latest snapshot from the relay; re-send when phones join
  // in case the relay restarted.
  useEffect(() => {
    if (status.available && status.phones > 0) publish();
  }, [status.available, status.phones]);

  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}
