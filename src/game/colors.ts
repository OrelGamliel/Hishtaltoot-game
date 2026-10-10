/** Hand-picked, high-contrast colours that read well on a TV and stay distinct from each other. */
const PALETTE = [
  '#ff3d7f', // pink
  '#22d3ee', // cyan
  '#facc15', // yellow
  '#a3e635', // lime
  '#a78bfa', // violet
  '#fb923c', // orange
  '#34d399', // emerald
  '#f472b6', // rose
  '#60a5fa', // blue
  '#f87171', // red
  '#2dd4bf', // teal
  '#e879f9', // fuchsia
  '#fbbf24', // amber
  '#818cf8', // indigo
  '#4ade80', // green
  '#fda4af', // light rose
  '#93c5fd', // light blue
  '#fde047', // light yellow
  '#c4b5fd', // lavender
  '#fdba74', // peach
];

export function playerColor(i: number): string {
  if (i < PALETTE.length) return PALETTE[i];
  // Golden-angle hues beyond the palette.
  const hue = Math.round((i * 137.508) % 360);
  return `hsl(${hue} 80% 62%)`;
}

/** Dark text on light colours, white text on dark ones. */
export function textOn(color: string): string {
  if (color.startsWith('hsl')) return '#0b0b1a';
  const n = parseInt(color.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0b0b1a' : '#ffffff';
}
