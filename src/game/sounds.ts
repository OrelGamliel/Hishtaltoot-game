import { loadJSON, MUTE_KEY, saveJSON } from './storage';

/** Synthesised sound effects (Web Audio), so the app ships with no audio files. */
let ctx: AudioContext | null = null;
let muted = loadJSON<boolean>(MUTE_KEY) ?? false;
const listeners = new Set<(m: boolean) => void>();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  saveJSON(MUTE_KEY, m);
  listeners.forEach((l) => l(m));
}
export function onMuteChange(l: (m: boolean) => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.2) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  tick: () => tone(1200, 0, 0.05, 'square', 0.06),
  urgentTick: () => tone(1600, 0, 0.08, 'square', 0.1),
  correct: () => {
    tone(880, 0, 0.12, 'triangle', 0.25);
    tone(1320, 0.08, 0.18, 'triangle', 0.25);
  },
  pass: () => {
    tone(220, 0, 0.18, 'sawtooth', 0.12);
    tone(165, 0.1, 0.22, 'sawtooth', 0.12);
  },
  spin: () => tone(600 + Math.random() * 400, 0, 0.04, 'square', 0.05),
  land: () => {
    tone(523, 0, 0.15, 'triangle', 0.2);
    tone(784, 0.1, 0.25, 'triangle', 0.2);
  },
  buzzer: () => tone(110, 0, 0.7, 'sawtooth', 0.2),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.22));
    tone(1047, 0.5, 0.8, 'triangle', 0.2);
    tone(1319, 0.5, 0.8, 'sine', 0.12);
  },
};
