/**
 * Ordnet die Farben eines Farbtyps nach ihrer Rolle im Kleiderschrank.
 *
 * Eine Palette ist keine flache Liste gleichwertiger Farben: Ein Schrank
 * braucht wenige ruhige Basisfarben, die sich mit allem kombinieren lassen,
 * und wenige kräftige Akzente. Welche Farbe welche Rolle übernimmt, lässt sich
 * aus Helligkeit (L*) und Buntheit (Chroma) ablesen — nicht aus der Reihenfolge
 * in der JSON-Datei.
 */

import { hexToLab, labToRgb, rgbToHex, calculateChroma } from './color.js';

/** Bis zu welcher Helligkeit eine Farbe als dunkler Anker taugt. */
const DARK_ANCHOR_L = 50;

/** Farben mit einem Lab-Profil anreichern. */
function annotate(list) {
  return list
    .map((c) => {
      const lab = hexToLab(c.hex);
      return lab ? { ...c, lab, L: lab.L, chroma: calculateChroma(lab) } : null;
    })
    .filter(Boolean);
}

/**
 * Teilt eine Palette in Basis- und Akzentfarben.
 *
 * @param {Array<{hex:string,name:string}>} good  good-Liste eines Farbtyps
 * @param {{baseCount:number, accentCount:number, contrastFirst?:boolean}} opts
 */
export function splitPalette(good, { baseCount = 3, accentCount = 2, contrastFirst = false } = {}) {
  const colors = annotate(good);
  if (!colors.length) return { base: [], accent: [] };

  if (contrastFirst) {
    // Für kontrastbetonte Stile: hellste und dunkelste Farbe bilden das Gerüst.
    const byL = [...colors].sort((a, b) => a.L - b.L);
    const base = [byL[0], byL[byL.length - 1]].slice(0, Math.max(2, baseCount));
    const rest = colors.filter((c) => !base.includes(c));
    const accent = [...rest].sort((a, b) => b.chroma - a.chroma).slice(0, accentCount);
    return withAnchorInfo(base, accent);
  }

  // Basis: die ruhigsten Farben — sie tragen das Outfit.
  const base = [...colors]
    .sort((a, b) => (a.chroma - b.chroma) || (a.L - b.L))
    .slice(0, baseCount);

  // Ein Schrank braucht einen dunklen Anker: etwas, das zu allem passt und
  // Outfits erdet. Reine Chroma-Sortierung liefert den nicht — bei "Kühler
  // Sommer" gewinnen Silbergrau, Lavendel und Off-White, während Navy wegen
  // seiner höheren Buntheit durchfällt. Fehlt ein dunkler Ton in der Auswahl,
  // ersetzt der ruhigste dunkle Ton der Palette die hellste Basisfarbe.
  if (baseCount > 1 && !base.some((c) => c.L < DARK_ANCHOR_L)) {
    const anchor = colors
      .filter((c) => c.L < DARK_ANCHOR_L && !base.includes(c))
      .sort((a, b) => a.chroma - b.chroma)[0];
    if (anchor) {
      let lightestIdx = 0;
      base.forEach((c, i) => { if (c.L > base[lightestIdx].L) lightestIdx = i; });
      base[lightestIdx] = anchor;
    }
  }

  base.sort((a, b) => a.L - b.L);

  // Akzent: die buntesten der übrigen.
  const accent = colors
    .filter((c) => !base.includes(c))
    .sort((a, b) => b.chroma - a.chroma)
    .slice(0, accentCount);

  return withAnchorInfo(base, accent);
}

/**
 * Ergänzt, ob die Basis einen dunklen Anker enthält.
 *
 * Helle Farbtypen (Heller Frühling, Heller Sommer) haben bewusst keinen — ihr
 * dunkelster Ton ist ein Camel oder ein weiches Marine, nicht Schwarz. Das ist
 * keine Lücke, sondern eine Eigenschaft des Typs, und die Beratung sagt es
 * besser dazu, statt drei Pastelltöne wortlos als "Schrankbasis" auszugeben.
 */
function withAnchorInfo(base, accent) {
  const sorted = [...base].sort((a, b) => a.L - b.L);
  return {
    base: sorted,
    accent,
    darkest: sorted[0] ?? null,
    hasDarkAnchor: Boolean(sorted[0] && sorted[0].L < DARK_ANCHOR_L)
  };
}

/** Farbe um deltaL in der Helligkeit verschieben (negativ = dunkler). */
export function shade(hex, deltaL) {
  const lab = hexToLab(hex);
  if (!lab) return hex;
  const rgb = labToRgb({ ...lab, L: Math.max(0, Math.min(100, lab.L + deltaL)) });
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/** Lesbare Kontrastfarbe (hell oder dunkel) für Text auf dieser Fläche. */
export function readableOn(hex) {
  const lab = hexToLab(hex);
  return !lab || lab.L > 55 ? '#14171f' : '#eef2f6';
}
