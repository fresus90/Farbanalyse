/**
 * Farbraum-Konvertierungen und -Metriken.
 *
 * Aus skinAnalysis.js herausgezogen, weil die Stilberatung dieselben Funktionen
 * braucht (Paletten nach Helligkeit und Buntheit sortieren), skinAnalysis.js
 * aber im lazy geladenen MediaPipe-Chunk liegt — ein Import von dort würde
 * 125 KB Gesichtserkennung in den Haupt-Bundle ziehen.
 *
 * sRGB, D65, Beobachter 2°.
 */

/** '#rrggbb' → {r,g,b} (0..255). Kurzform '#rgb' wird ebenfalls verstanden. */
export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function rgbToLab(r, g, b) {
  let rl = r / 255, gl = g / 255, bl = b / 255;
  rl = rl > 0.04045 ? Math.pow((rl + 0.055) / 1.055, 2.4) : rl / 12.92;
  gl = gl > 0.04045 ? Math.pow((gl + 0.055) / 1.055, 2.4) : gl / 12.92;
  bl = bl > 0.04045 ? Math.pow((bl + 0.055) / 1.055, 2.4) : bl / 12.92;
  let x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  let y = (0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl);
  let z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) / 1.08883;
  const eps = 0.008856, kap = 903.3;
  x = x > eps ? Math.cbrt(x) : (kap * x + 16) / 116;
  y = y > eps ? Math.cbrt(y) : (kap * y + 16) / 116;
  z = z > eps ? Math.cbrt(z) : (kap * z + 16) / 116;
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

export function labToRgb(lab) {
  let y = (lab.L + 16) / 116, x = lab.a / 500 + y, z = y - lab.b / 200;
  const eps = 0.008856, kap = 903.3;
  x = (x * x * x > eps) ? x * x * x : (116 * x - 16) / kap;
  y = (y * y * y > eps) ? y * y * y : (116 * y - 16) / kap;
  z = (z * z * z > eps) ? z * z * z : (116 * z - 16) / kap;
  x *= 0.95047; z *= 1.08883;
  let r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  let g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  let b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b;
  return {
    r: Math.round(Math.max(0, Math.min(255, r * 255))),
    g: Math.round(Math.max(0, Math.min(255, g * 255))),
    b: Math.round(Math.max(0, Math.min(255, b * 255)))
  };
}

/** Bequemlichkeit: '#rrggbb' → Lab. Gibt null bei ungültigem Hex. */
export function hexToLab(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToLab(rgb.r, rgb.g, rgb.b) : null;
}

export function calculateChroma(lab) { return Math.sqrt(lab.a * lab.a + lab.b * lab.b); }

export function calculateHueAngle(lab) {
  const h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
  return h < 0 ? h + 360 : h;
}

/** DeltaE76 — schnell, für Clustering und grobe Nähe-Checks. */
export function deltaE76(lab1, lab2) {
  const dL = lab1.L - lab2.L, da = lab1.a - lab2.a, db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * DeltaE2000 — perzeptuell gleichmäßigere Farbdifferenz.
 * Wird für Kontrast-Berechnungen verwendet (Haut↔Haar, Haut↔Iris).
 */
export function deltaE2000(lab1, lab2) {
  const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
  const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;

  const avgL = (L1 + L2) / 2;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (C1 + C2) / 2;

  const avgC7 = Math.pow(avgC, 7);
  const G = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const avgCp = (C1p + C2p) / 2;

  let h1p = Math.atan2(b1, a1p) * 180 / Math.PI;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * 180 / Math.PI;
  if (h2p < 0) h2p += 360;

  let dHp = h2p - h1p;
  if (Math.abs(dHp) > 180) dHp += (dHp > 0) ? -360 : 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp2 = 2 * Math.sqrt(C1p * C2p) * Math.sin(dHp * Math.PI / 360);

  let avgHp = (h1p + h2p) / 2;
  if (Math.abs(h1p - h2p) > 180) avgHp += (avgHp < 180) ? 180 : -180;

  const T = 1
    - 0.17 * Math.cos((avgHp - 30) * Math.PI / 180)
    + 0.24 * Math.cos(2 * avgHp * Math.PI / 180)
    + 0.32 * Math.cos((3 * avgHp + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * avgHp - 63) * Math.PI / 180);

  const SL = 1 + 0.015 * (avgL - 50) * (avgL - 50) / Math.sqrt(20 + (avgL - 50) * (avgL - 50));
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;

  const expArg = -((avgHp - 275) / 25) * ((avgHp - 275) / 25);
  const RT = -2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)))
    * Math.sin(60 * Math.exp(expArg) * Math.PI / 180);

  return Math.sqrt(
    (dLp / SL) * (dLp / SL) +
    (dCp / SC) * (dCp / SC) +
    (dHp2 / SH) * (dHp2 / SH) +
    RT * (dCp / SC) * (dHp2 / SH)
  );
}
