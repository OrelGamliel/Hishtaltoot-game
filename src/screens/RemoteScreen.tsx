import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import type { RemoteCommand, RemoteSide, RemoteSnapshot } from '../game/remote';
import { textOn } from '../game/colors';

type Conn = 'connecting' | 'live' | 'lost' | 'badToken';

function formatClock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return s < 10 ? s.toFixed(1) : String(Math.ceil(s));
}

/** The page a phone opens from the QR code: shows the answer and works as the host's remote. */
export default function RemoteScreen({ token }: { token: string }) {
  const { t, lang, setLang } = useI18n();
  const [snap, setSnap] = useState<RemoteSnapshot | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [conn, setConn] = useState<Conn>('connecting');
  const [tvOnline, setTvOnline] = useState(true);
  const [toast, setToast] = useState('');
  const [, setFrame] = useState(0);

  // Live connection to the relay.
  useEffect(() => {
    let es: EventSource | null = null;
    let alive = true;
    const q = `token=${encodeURIComponent(token)}`;
    fetch(`/__remote/check?${q}`, { cache: 'no-store' })
      .then((r) => {
        if (!alive) return;
        if (r.status === 403) return setConn('badToken');
        es = new EventSource(`/__remote/events?${q}`);
        es.onopen = () => setConn('live');
        es.onerror = () => setConn((c) => (c === 'badToken' ? c : 'lost'));
        es.addEventListener('state', (e) => {
          setSnap(JSON.parse((e as MessageEvent).data));
          setReceivedAt(performance.now());
          setConn('live');
        });
        es.addEventListener('status', (e) => setTvOnline(!!JSON.parse((e as MessageEvent).data).tv));
      })
      .catch(() => alive && setConn('lost'));
    return () => {
      alive = false;
      es?.close();
    };
  }, [token]);

  // Follow the TV's language.
  useEffect(() => {
    if (snap?.lang && snap.lang !== lang) setLang(snap.lang);
  }, [snap?.lang, lang, setLang]);

  // Animate the running clock between snapshots.
  const running = snap?.duel?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setFrame((f) => f + 1), 100);
    return () => clearInterval(id);
  }, [running]);

  // Commands: a short lock stops an accidental double tap from skipping two questions.
  const lockUntil = useRef(0);
  const send = async (cmd: RemoteCommand) => {
    const now = performance.now();
    if (now < lockUntil.current) return;
    lockUntil.current = now + 450;
    navigator.vibrate?.(25);
    try {
      const res = await fetch(`/__remote/command?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd, id: `${Date.now()}-${Math.random()}` }),
      });
      if (res.status === 409) flash(t('remoteNoTv'));
      else if (res.status === 403) setConn('badToken');
    } catch {
      flash(t('remoteReconnecting'));
    }
  };
  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2500);
  };

  const elapsed = running ? performance.now() - receivedAt : 0;
  const d = snap?.duel ?? null;
  const left = (side: 'challenger' | 'defender') =>
    d ? Math.max(0, d[side].remaining - (d.active === side ? elapsed : 0)) : 0;

  if (conn === 'badToken') {
    return <Centered>{t('remoteBadToken')}</Centered>;
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3 select-none" style={{ touchAction: 'manipulation' }}>
      {/* status line */}
      <div className="flex items-center justify-between text-xs text-white/50">
        <span className="logo-text text-base font-black">{t('appName')}</span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${conn === 'live' && tvOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {conn === 'connecting' ? t('remoteConnecting') : conn === 'lost' ? t('remoteReconnecting') : !tvOnline ? t('remoteNoTv') : t('phoneRemote')}
        </span>
      </div>

      {!snap ? (
        <Centered>{conn === 'live' ? t('remoteWaiting') : t('remoteConnecting')}</Centered>
      ) : d ? (
        <>
          <div className="text-center">
            <span className="rounded-full border border-accent-2/50 bg-accent-2/10 px-4 py-1 text-sm font-black text-accent-2" dir="auto">
              {d.category}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['challenger', 'defender'] as const).map((side) => (
              <Clock key={side} side={d[side]} ms={left(side)} active={d.active === side && d.status !== 'over'} />
            ))}
          </div>

          {/* answer */}
          <div className="card flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden p-4 text-center">
            {d.status === 'over' && d.winner ? (
              <div className="pop-in space-y-3">
                <div
                  className="rounded-2xl px-6 py-3 text-3xl font-black"
                  style={{ background: d[d.winner].color, color: textOn(d[d.winner].color) }}
                >
                  {t('wins', { name: d[d.winner].name })}
                </div>
                {d.question && (
                  <p className="text-white/70">{t('correctAnswer', { answer: d.question.answer })}</p>
                )}
              </div>
            ) : d.question ? (
              <>
                <span className="text-xs font-bold tracking-widest text-white/50 uppercase">{t('remoteAnswer')}</span>
                <p key={d.question.answer + d.question.prompt} className="question-in text-[clamp(2rem,11vw,4rem)] leading-tight font-black" dir="auto">
                  {d.question.answer}
                </p>
                {d.question.image && (
                  <img src={d.question.image} alt="" className="max-h-[22vh] max-w-full rounded-lg object-contain opacity-90" />
                )}
                {d.question.prompt && (
                  <p className="text-sm text-white/60" dir="auto">
                    {d.question.prompt}
                  </p>
                )}
              </>
            ) : (
              <p className="text-white/60">{d.outOfQuestions ? t('outOfQuestions') : t('remoteNoQuestion')}</p>
            )}
            {d.status === 'paused' && <p className="text-xl font-black text-amber-300">⏸ {t('paused')}</p>}
          </div>

          {/* controls */}
          <div className="grid shrink-0 gap-2 pb-[env(safe-area-inset-bottom)]">
            {d.status === 'ready' && <Big onClick={() => send('begin')} tone="primary">▶ {t('remoteStart')}</Big>}
            {d.status === 'running' && (
              <>
                <Big onClick={() => send('correct')} tone="green" tall>
                  ✓ {t('correct')}
                </Big>
                <div className="grid grid-cols-2 gap-2">
                  <Big onClick={() => send('pass')} tone="amber">
                    ↷ {t('pass')}
                  </Big>
                  <Big onClick={() => send('pause')} tone="ghost">
                    ⏸ {t('pause')}
                  </Big>
                </div>
              </>
            )}
            {d.status === 'paused' && !d.outOfQuestions && <Big onClick={() => send('resume')} tone="primary">▶ {t('resume')}</Big>}
            {d.status === 'over' && <Big onClick={() => send('continue')} tone="primary">{t('continue')} ⏎</Big>}
          </div>
        </>
      ) : snap.board ? (
        <>
          <Centered>
            {snap.board.stage === 'randomize' && t('remoteSpinNext')}
            {snap.board.stage === 'choose' && snap.board.activeName && t('remoteChoosing', { name: snap.board.activeName })}
            {snap.board.stage === 'postWin' && snap.board.activeName && t('remoteWinnerChooses', { name: snap.board.activeName })}
            <span className="mt-2 block text-sm text-white/40">{t('playersLeft', { n: snap.board.playersLeft })}</span>
          </Centered>
          {snap.board.stage === 'randomize' && (
            <Big onClick={() => send('spin')} tone="primary" tall>
              🎲 {t('remoteSpin')}
            </Big>
          )}
        </>
      ) : snap.champion ? (
        <Centered>
          <span className="text-gold">👑 {t('champion')}</span>
          <span
            className="mt-3 block rounded-2xl px-6 py-3 text-4xl font-black"
            style={{ background: snap.champion.color, color: textOn(snap.champion.color) }}
          >
            {snap.champion.name}
          </span>
        </Centered>
      ) : (
        <Centered>{t('remoteSetup')}</Centered>
      )}

      {toast && (
        <div className="fade-in fixed inset-x-4 bottom-24 rounded-xl bg-red-500/90 p-3 text-center font-bold text-white">{toast}</div>
      )}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-xl font-bold">{children}</div>;
}

function Clock({ side, ms, active }: { side: RemoteSide; ms: number; active: boolean }) {
  return (
    <div
      className={`card flex flex-col items-center gap-1 overflow-hidden p-2 transition ${active ? 'side-active' : 'opacity-50'}`}
      style={{ '--side-color': side.color } as CSSProperties}
    >
      <span
        className="max-w-full truncate rounded-md px-2 text-sm font-black"
        style={{ background: side.color, color: textOn(side.color) }}
        dir="auto"
      >
        {side.name}
      </span>
      <span className={`clock-digits text-4xl font-black ${active && ms < 10_000 ? 'text-red-400' : ''}`} dir="ltr">
        {formatClock(ms)}
      </span>
    </div>
  );
}

function Big({
  children,
  onClick,
  tone,
  tall,
}: {
  children: ReactNode;
  onClick: () => void;
  tone: 'primary' | 'green' | 'amber' | 'ghost';
  tall?: boolean;
}) {
  const cls = {
    primary: 'btn-primary',
    green: 'bg-emerald-500 text-white active:bg-emerald-600',
    amber: 'bg-amber-500 text-black active:bg-amber-600',
    ghost: 'btn-ghost',
  }[tone];
  return (
    <button className={`btn ${cls} w-full text-2xl ${tall ? 'py-8 text-3xl' : 'py-5'}`} onClick={onClick}>
      {children}
    </button>
  );
}
