/** A color-blind friendly palette: each color is paired with a distinct marker. */
const PALETTE = [
  { color: '#0072B2', tint: '#E4F1F8', foreground: '#FFFFFF', marker: '●' },
  { color: '#D55E00', tint: '#FBEADF', foreground: '#FFFFFF', marker: '◆' },
  { color: '#009E73', tint: '#E3F5EF', foreground: '#FFFFFF', marker: '▲' },
  { color: '#CC79A7', tint: '#F7EAF2', foreground: '#231800', marker: '■' },
  { color: '#E69F00', tint: '#FFF3D6', foreground: '#231800', marker: '✚' },
  { color: '#56B4E9', tint: '#E5F5FC', foreground: '#231800', marker: '⬟' },
  { color: '#6A3D9A', tint: '#EEE8F5', foreground: '#FFFFFF', marker: '★' },
] as const;

export interface GroupColor {
  color: string;
  tint: string;
  foreground: string;
  marker: string;
}

/** Stable assignment: the same group keeps its color across filters and calendar views. */
export function groupColorFor(groupId: string): GroupColor {
  let hash = 0;
  for (const character of groupId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const color = PALETTE[hash % PALETTE.length] ?? PALETTE[0];
  return color;
}

/** Assigns distinct colors to the groups visible together, avoiding hash collisions. */
export function groupColorsFor(groupIds: readonly string[]): Map<string, GroupColor> {
  const colors = new Map<string, GroupColor>();
  [...new Set(groupIds)].sort().forEach((groupId, index) => {
    colors.set(groupId, PALETTE[index % PALETTE.length] ?? PALETTE[0]);
  });
  return colors;
}
