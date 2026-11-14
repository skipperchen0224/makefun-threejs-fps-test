// The look plan, in one place. Seven values; the lighting makes every shade the game
// needs, so no other colour appears in the code. The same names are the CSS custom
// properties in index.html.
export const PALETTE = {
  canvas: '#17130f',
  surface: '#221c16',
  hairline: '#3a3128',
  ink: '#f2ede4',
  muted: '#a89c8b',
  accent: '#f0a830',
  danger: '#e5484d',
  slate: '#7fb3d5',
};

export function shade(name) {
  return PALETTE[name];
}
