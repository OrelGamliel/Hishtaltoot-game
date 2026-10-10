import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import { isMuted, onMuteChange, setMuted } from '../game/sounds';

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { t } = useI18n();
  const box = size === 'lg' ? 'h-12 w-12' : 'h-8 w-8';
  return (
    <div className="flex items-center gap-3">
      <div className={`grid ${box} grid-cols-2 gap-0.5 rounded-md p-0.5`} aria-hidden>
        <span className="rounded-sm bg-accent" />
        <span className="rounded-sm bg-accent-2" />
        <span className="rounded-sm bg-gold" />
        <span className="rounded-sm bg-accent" />
      </div>
      <span className={`logo-text font-black tracking-tight ${size === 'lg' ? 'text-5xl' : 'text-2xl'}`}>
        {t('appName')}
      </span>
    </div>
  );
}

export function useMuted(): [boolean, (m: boolean) => void] {
  const [m, setM] = useState(isMuted());
  useEffect(() => {
    const off = onMuteChange(setM);
    return () => {
      off();
    };
  }, []);
  return [m, setMuted];
}

/** Language, sound and fullscreen toggles. */
export function GlobalControls() {
  const { t, lang, setLang } = useI18n();
  const [muted, setMute] = useMuted();
  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-ghost px-3" onClick={() => setLang(lang === 'he' ? 'en' : 'he')}>
        {t('language')}
      </button>
      <button
        className="btn btn-ghost px-3"
        title={muted ? t('unmute') : t('mute')}
        aria-label={muted ? t('unmute') : t('mute')}
        onClick={() => setMute(!muted)}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <button
        className="btn btn-ghost px-3"
        title={t('fullscreen')}
        aria-label={t('fullscreen')}
        onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.();
        }}
      >
        ⛶
      </button>
    </div>
  );
}

export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-3">
      <Logo />
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <GlobalControls />
      </div>
    </header>
  );
}

export function Modal({
  children,
  onClose,
  wide,
}: {
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => !wide && e.target === e.currentTarget && onClose?.()}
    >
      <div className={`card pop-in max-h-[92vh] w-full overflow-auto p-6 ${wide ? 'max-w-5xl' : 'max-w-lg'}`}>
        {children}
      </div>
    </div>
  );
}

/** A button that asks "Sure?" inline before acting. */
export function ConfirmButton({
  children,
  onConfirm,
  className = 'btn btn-ghost',
  disabled,
}: {
  children: ReactNode;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button className={className} disabled={disabled} onClick={() => setAsking(true)}>
        {children}
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-sm text-white/70">{t('confirm')}</span>
      <button
        className="btn btn-danger px-3 py-1"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {t('yes')}
      </button>
      <button className="btn btn-ghost px-3 py-1" onClick={() => setAsking(false)}>
        {t('no')}
      </button>
    </span>
  );
}
