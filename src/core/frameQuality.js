/**
 * Bewertet ein Kamerabild live auf Eignung für die Farbanalyse.
 *
 * Jede Prüfung liefert nicht nur einen Zustand, sondern die Handlung, die ihn
 * verbessert. Ein rotes Symbol ohne Anweisung hilft niemandem vor der Kamera.
 *
 * Die Schwellen stammen aus den Werten, die die Analyse selbst braucht, und
 * sind an zwei echten Aufnahmen derselben Person kalibriert (Tageslicht gegen
 * Abendlicht unter Kunstlicht).
 */

// Landmark-Indizes
const L_EYE_OUT = 33, L_EYE_IN = 133;
const R_EYE_IN = 362, R_EYE_OUT = 263;
const IRIS_L = 468, IRIS_R = 473;
const FACE_LEFT = 234, FACE_RIGHT = 454;
const FOREHEAD_TOP = 10, CHIN = 152;
const CHEEK_L = 116, CHEEK_R = 345;

/** Zielrahmen: entspricht dem Oval in der Kamera-Überlagerung. */
const TARGET_CX = 0.50, TARGET_CY = 0.46;
const FACE_WIDTH_MIN = 0.34, FACE_WIDTH_MAX = 0.62;

const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function patch(pixels, W, H, cx, cy, radius) {
  let n = 0, sr = 0, sg = 0, sb = 0, sl = 0, clipped = 0;
  const r = Math.max(2, Math.round(radius));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = (y * W + x) * 4;
      const cr = pixels[i], cg = pixels[i + 1], cb = pixels[i + 2];
      sr += cr; sg += cg; sb += cb; sl += luminance(cr, cg, cb);
      // Clipping tritt pro Kanal auf: Auf Haut brennt Rot zuerst aus, waehrend
      // die Luminanz noch unauffaellig aussieht. Eine Luminanzschwelle haette
      // genau den haeufigsten Fall uebersehen.
      if (cr >= 250 || cg >= 250 || cb >= 250) clipped++;
      n++;
    }
  }
  if (!n) return null;
  return { n, r: sr / n, g: sg / n, b: sb / n, lum: sl / n, clipped: clipped / n };
}

/** Grobe Sklera-Messung für den Farbstich — dieselbe Perzentil-Logik wie in der Analyse. */
function scleraCast(pixels, W, H, lm, skinLum) {
  const win = [];
  const eyeWidth = Math.hypot((lm[L_EYE_IN].x - lm[L_EYE_OUT].x) * W, (lm[L_EYE_IN].y - lm[L_EYE_OUT].y) * H);
  const rad = Math.max(2, Math.round(eyeWidth * 0.16));
  for (const [inner, iris] of [[L_EYE_IN, IRIS_L], [R_EYE_IN, IRIS_R]]) {
    if (!lm[iris]) continue;
    const cx = Math.round((lm[inner].x + lm[iris].x) / 2 * W);
    const cy = Math.round((lm[inner].y + lm[iris].y) / 2 * H);
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const i = (y * W + x) * 4;
        win.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], lum: luminance(pixels[i], pixels[i + 1], pixels[i + 2]) });
      }
    }
  }
  if (win.length < 20) return null;
  win.sort((a, b) => a.lum - b.lum);
  const band = win.slice(Math.floor(win.length * 0.45), Math.floor(win.length * 0.95));
  if (!band.length) return null;
  const mid = band[Math.floor(band.length / 2)].lum;
  if (mid < skinLum * 0.55) return null;   // zu tief im Schatten, taugt nicht als Referenz

  let sr = 0, sg = 0, sb = 0;
  for (const p of band) { sr += p.r; sg += p.g; sb += p.b; }
  const n = band.length;
  // Abweichung von neutral, grob in Prozent der mittleren Helligkeit
  const mean = (sr + sg + sb) / (3 * n);
  if (mean < 1) return null;
  return {
    warm: ((sr / n) - (sb / n)) / mean,      // >0 = rot/gelb-Stich
    green: ((sg / n) - ((sr / n) + (sb / n)) / 2) / mean
  };
}

/**
 * @param {{landmarks:Array, pixels:Uint8ClampedArray, W:number, H:number,
 *          mirrored:boolean}} input
 *   mirrored — ob die Vorschau gespiegelt dargestellt wird (Frontkamera).
 *   Die Pixeldaten kommen ungespiegelt aus dem Stream, der Mensch sieht aber
 *   das gespiegelte Bild. Ohne diese Unterscheidung stünde in jeder
 *   Richtungsanweisung das Gegenteil dessen, was zu tun ist.
 * @returns {{checks:Array, ready:boolean}}
 */
export function measureFrame({ landmarks: lm, pixels, W, H, mirrored = false }) {
  /** Rohkoordinate -> Richtung, wie sie auf dem Bildschirm erscheint. */
  const toScreen = (v) => (mirrored ? -v : v);
  const checks = [];
  const add = (id, label, state, hint, value) => checks.push({ id, label, state, hint, value });

  if (!lm) {
    add('face', 'Gesicht', 'bad', 'Kein Gesicht erkannt — ins Bild rücken und Kamera ruhig halten.');
    return { checks, ready: false };
  }

  const faceW = Math.abs(lm[FACE_RIGHT].x - lm[FACE_LEFT].x);
  const faceH = Math.abs(lm[CHIN].y - lm[FOREHEAD_TOP].y);
  const cx = (lm[FACE_LEFT].x + lm[FACE_RIGHT].x) / 2;
  const cy = (lm[FOREHEAD_TOP].y + lm[CHIN].y) / 2;
  const facePx = Math.max(8, faceW * W);

  // ── Abstand ────────────────────────────────────────────────────────────
  if (faceW < FACE_WIDTH_MIN) {
    add('size', 'Abstand', faceW < FACE_WIDTH_MIN * 0.75 ? 'bad' : 'warn',
      'Näher herangehen, bis das Gesicht das Oval füllt.',
      `${Math.round(faceW * 100)} % → mind. ${Math.round(FACE_WIDTH_MIN * 100)} %`);
  } else if (faceW > FACE_WIDTH_MAX) {
    add('size', 'Abstand', 'warn', 'Etwas weiter weg — Kopf ganz ins Bild.',
      `${Math.round(faceW * 100)} % → max. ${Math.round(FACE_WIDTH_MAX * 100)} %`);
  } else {
    add('size', 'Abstand', 'ok', 'Passt.', `${Math.round(faceW * 100)} %`);
  }

  // ── Position ───────────────────────────────────────────────────────────
  const dx = cx - TARGET_CX, dy = cy - TARGET_CY;
  const off = Math.hypot(dx, dy);
  if (off > 0.07) {
    const sdx = toScreen(dx);
    const richtung = Math.abs(dx) > Math.abs(dy)
      ? (sdx > 0 ? 'nach links' : 'nach rechts')
      : (dy > 0 ? 'nach oben' : 'nach unten');
    add('pos', 'Position', off > 0.13 ? 'bad' : 'warn', `Gesicht ${richtung} ins Oval bewegen.`);
  } else {
    add('pos', 'Position', 'ok', 'Mittig im Oval.');
  }

  // ── Kopfneigung (Roll) ─────────────────────────────────────────────────
  const eyeL = { x: (lm[L_EYE_OUT].x + lm[L_EYE_IN].x) / 2, y: (lm[L_EYE_OUT].y + lm[L_EYE_IN].y) / 2 };
  const eyeR = { x: (lm[R_EYE_IN].x + lm[R_EYE_OUT].x) / 2, y: (lm[R_EYE_IN].y + lm[R_EYE_OUT].y) / 2 };
  const rollRaw = Math.atan2((eyeR.y - eyeL.y) * H, (eyeR.x - eyeL.x) * W) * 180 / Math.PI;
  const roll = toScreen(rollRaw);   // so geneigt, wie es auf dem Schirm aussieht
  if (Math.abs(roll) > 5) {
    add('roll', 'Kopfhaltung', Math.abs(roll) > 10 ? 'bad' : 'warn',
      `Kopf ${roll > 0 ? 'nach links' : 'nach rechts'} aufrichten.`, `${Math.abs(roll).toFixed(0)}° → unter 5°`);
  } else {
    add('roll', 'Kopfhaltung', 'ok', 'Gerade.', `${Math.abs(roll).toFixed(0)}°`);
  }

  // ── Kamerahöhe (Pitch) ─────────────────────────────────────────────────
  // Aus den z-Werten statt aus der Rotationsmatrix: MediaPipe legt den Ursprung
  // in die Kopfmitte, kleinere z sind näher an der Kamera. Ist die Kamera unter
  // Augenhöhe, liegt das Kinn näher als die Stirn — das Vorzeichen ist damit
  // ableitbar und nicht geraten.
  const pitch = (lm[FOREHEAD_TOP].z - lm[CHIN].z) / Math.max(1e-6, faceH);
  if (Math.abs(pitch) > 0.25) {
    add('pitch', 'Kamerahöhe', Math.abs(pitch) > 0.45 ? 'bad' : 'warn',
      pitch > 0 ? 'Kamera höher halten — sie zeigt von unten nach oben.'
                : 'Kamera tiefer halten — sie zeigt von oben herab.',
      'Ziel: Augenhöhe');
  } else {
    add('pitch', 'Kamerahöhe', 'ok', 'Auf Augenhöhe.');
  }

  // ── Belichtung ─────────────────────────────────────────────────────────
  const rad = facePx * 0.06;
  const pL = patch(pixels, W, H, lm[CHEEK_L].x * W, lm[CHEEK_L].y * H, rad);
  const pR = patch(pixels, W, H, lm[CHEEK_R].x * W, lm[CHEEK_R].y * H, rad);
  const pF = patch(pixels, W, H, lm[FOREHEAD_TOP].x * W, (lm[FOREHEAD_TOP].y + 0.04) * H, rad);
  const parts = [pL, pR, pF].filter(Boolean);
  const skinLum = parts.length ? parts.reduce((a, p) => a + p.lum, 0) / parts.length : 0;
  const clipped = parts.length ? Math.max(...parts.map((p) => p.clipped)) : 0;

  if (!parts.length) {
    add('exposure', 'Belichtung', 'warn', 'Hautton nicht messbar.');
  } else if (clipped > 0.06) {
    add('exposure', 'Belichtung', 'bad', 'Überbelichtet — weg vom direkten Licht oder Belichtung senken.',
      `${Math.round(clipped * 100)} % ausgebrannt`);
  } else if (skinLum < 95) {
    add('exposure', 'Belichtung', skinLum < 70 ? 'bad' : 'warn',
      'Zu dunkel — mehr Licht von vorne, ans Fenster stellen.',
      `${Math.round(skinLum)} → 110 bis 200`);
  } else if (skinLum > 215) {
    add('exposure', 'Belichtung', 'warn', 'Sehr hell — etwas aus dem direkten Licht treten.',
      `${Math.round(skinLum)} → 110 bis 200`);
  } else {
    add('exposure', 'Belichtung', 'ok', 'Gut ausgeleuchtet.', `${Math.round(skinLum)}`);
  }

  // ── Gleichmäßigkeit ────────────────────────────────────────────────────
  if (pL && pR) {
    const ratio = Math.max(pL.lum, pR.lum) / Math.max(1, Math.min(pL.lum, pR.lum));
    if (ratio > 1.25) {
      // CHEEK_L/CHEEK_R sind Landmark-Seiten im Rohbild; fuer die Anweisung
      // zaehlt, wo der Mensch die helle Haelfte sieht.
      const hellDx = toScreen((pL.lum > pR.lum ? lm[CHEEK_L].x : lm[CHEEK_R].x) - 0.5);
      add('even', 'Seitenlicht', ratio > 1.5 ? 'bad' : 'warn',
        `Eine Gesichtshälfte ist deutlich heller — zur Lichtquelle drehen (${hellDx > 0 ? 'nach rechts' : 'nach links'}).`,
        `${(ratio * 100 - 100).toFixed(0)} % Unterschied → unter 25 %`);
    } else {
      add('even', 'Seitenlicht', 'ok', 'Gleichmäßig ausgeleuchtet.');
    }
  }

  // ── Farbstich ──────────────────────────────────────────────────────────
  const cast = scleraCast(pixels, W, H, lm, skinLum);
  if (!cast) {
    add('cast', 'Lichtfarbe', 'warn', 'Augenweiß nicht messbar — Augen öffnen, Licht von vorne.');
  } else if (Math.abs(cast.warm) > 0.16 || Math.abs(cast.green) > 0.12) {
    add('cast', 'Lichtfarbe', Math.abs(cast.warm) > 0.26 ? 'bad' : 'warn',
      cast.warm > 0 ? 'Warmes Kunstlicht — besser Tageslicht am Fenster.'
                    : 'Kühler Farbstich — Mischlicht vermeiden, ans Fenster gehen.',
      `${(cast.warm * 100).toFixed(0)} % Stich → unter 16 %`);
  } else {
    add('cast', 'Lichtfarbe', 'ok', 'Neutrales Licht.');
  }

  return { checks, ready: checks.every((c) => c.state === 'ok') };
}
