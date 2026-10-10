import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useI18n } from '../i18n/i18n';
import { useRemoteStatus } from '../game/remoteBridge';

interface Address {
  name: string;
  address: string;
  url: string;
  virtual: boolean;
}

/** 📱 button + dialog with a QR code that opens the phone remote. Hidden without the dev relay. */
export default function RemoteButton() {
  const { t } = useI18n();
  const { available, phones } = useRemoteStatus();
  const [open, setOpen] = useState(false);
  if (!available) return null;
  return (
    <>
      <button
        className="btn btn-ghost relative px-3"
        title={t('phoneRemote')}
        aria-label={t('phoneRemote')}
        onClick={() => setOpen(true)}
      >
        📱
        {phones > 0 && (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-xs font-black text-white">
            {phones}
          </span>
        )}
      </button>
      {open && <RemoteDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function RemoteDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { phones } = useRemoteStatus();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [pick, setPick] = useState(0);
  const [qr, setQr] = useState('');

  useEffect(() => {
    fetch('/__remote/info', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { addresses: [] }))
      .then((d) => setAddresses(d.addresses ?? []))
      .catch(() => setAddresses([]));
  }, []);

  const url = addresses?.[pick]?.url ?? '';
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card pop-in w-full max-w-md space-y-4 p-6 text-center">
        <h2 className="text-2xl font-black">📱 {t('remoteTitle')}</h2>
        <p className="text-sm text-white/60">{t('remoteHint')}</p>

        {addresses === null ? (
          <p className="py-16 text-white/50">…</p>
        ) : addresses.length === 0 ? (
          <p className="rounded-xl bg-amber-500/10 p-4 text-amber-200">{t('remoteNoAddress')}</p>
        ) : (
          <>
            <div className="mx-auto aspect-square w-72 max-w-full rounded-2xl bg-white p-3">
              {qr && <img src={qr} alt={url} className="h-full w-full" style={{ imageRendering: 'pixelated' }} />}
            </div>
            <p className="font-mono text-sm break-all text-white/70" dir="ltr">
              {url}
            </p>
            {addresses.length > 1 && (
              <label className="block text-start">
                <span className="label">{t('remoteNetwork')}</span>
                <select className="input" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
                  {addresses.map((a, i) => (
                    <option key={a.address} value={i}>
                      {a.address} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        <p className={phones > 0 ? 'font-bold text-emerald-300' : 'text-white/50'}>{t('remotePhones', { n: phones })}</p>
        <p className="text-xs text-white/40">{t('remoteFirewall')}</p>
        <button className="btn btn-primary w-full" onClick={onClose}>
          {t('done')}
        </button>
      </div>
    </div>
  );
}
