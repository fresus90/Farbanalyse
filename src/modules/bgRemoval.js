/**
 * Freistellen der Person.
 *
 * Hauptweg ist eine gelernte Segmentierung (MediaPipe ImageSegmenter), Rückweg
 * das ursprüngliche Flood-Fill.
 *
 * Warum der Wechsel: Das Flood-Fill schätzte EINE globale Hintergrundfarbe aus
 * dem Mittelwert aller Randpixel und schnitt alles weg, was in RGB näher als 48
 * daran lag. Das scheitert an allem, was in echten Fotos vorkommt — an einem
 * Farbverlauf oder Schatten an der Wand, an blondem Haar vor heller Wand, an
 * einem grauen Oberteil vor grauem Hintergrund. Und Haar ist der schwerste Fall
 * überhaupt: Jede Strähne ist eine Mischung aus Haar- und Wandfarbe, und ein
 * harter Schwellwert kann eine Mischung nur ganz behalten oder ganz wegwerfen.
 *
 * Zusätzlich wird die Randfarbe entmischt (siehe decontaminateEdges). Für diese
 * App ist das kein Feinschliff: Sie legt beliebige Farben HINTER die Person,
 * und ein halbtransparenter Rand, der noch die Farbe der ursprünglichen Wand
 * trägt, wird vor jeder neuen Farbe als heller Saum sichtbar.
 */

import { segmentPerson } from '../core/segmentation.js';

/** Längste Kante, mit der gearbeitet wird. */
const MAX_EDGE = 900;

/** Unterhalb/oberhalb dieser Personen-Wahrscheinlichkeit ist die Maske eindeutig. */
const ALPHA_LO = 0.20;
const ALPHA_HI = 0.80;

/**
 * Stellt die Person frei.
 *
 * @param {HTMLImageElement} imgEl        Quellbild
 * @param {HTMLCanvasElement} workCanvas  Arbeits-Canvas (versteckt)
 * @param {(status: string) => void} [onStatus]
 * @returns {Promise<{url: string, method: 'segmentation'|'floodfill', reason?: string}>}
 *          Data-URL plus das tatsächlich genutzte Verfahren. Welcher Weg lief,
 *          ist für die Beurteilung des Ergebnisses entscheidend — ohne diese
 *          Angabe sieht der Nutzer nur ein schlechtes Freistellen und kann nicht
 *          unterscheiden, ob das Modell fehlte oder das Foto schwierig war.
 */
export async function removeBackground(imgEl, workCanvas, onStatus) {
  const { ctx, W, H } = drawScaled(imgEl, workCanvas);

  try {
    const mask = await segmentPerson(workCanvas, onStatus);
    onStatus?.('Kanten werden nachgezogen …');
    applyMask(ctx, W, H, mask);
    return { url: workCanvas.toDataURL('image/png'), method: 'segmentation' };
  } catch (err) {
    console.warn('Segmentierung nicht verfügbar, nutze Flood-Fill:', err.message);
    onStatus?.('Hintergrund wird entfernt …');
    // Das Bild wurde für die Segmentierung bereits verändert? Nein — applyMask
    // schreibt erst nach erfolgreicher Maske. Das Canvas trägt noch das Original.
    floodFillBackground(ctx, W, H);
    return { url: workCanvas.toDataURL('image/png'), method: 'floodfill', reason: err.message };
  }
}

/** Bild proportional verkleinert auf das Arbeits-Canvas zeichnen. */
function drawScaled(imgEl, workCanvas) {
  let W = imgEl.naturalWidth || imgEl.width;
  let H = imgEl.naturalHeight || imgEl.height;
  if (W > MAX_EDGE) { H = Math.round(H * MAX_EDGE / W); W = MAX_EDGE; }
  if (H > MAX_EDGE) { W = Math.round(W * MAX_EDGE / H); H = MAX_EDGE; }

  workCanvas.width = W;
  workCanvas.height = H;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(imgEl, 0, 0, W, H);
  return { ctx, W, H };
}

// ══════════════════════════════════════
// Hauptweg: gelernte Maske
// ══════════════════════════════════════

function applyMask(ctx, W, H, mask) {
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  const alpha = maskToAlpha(mask, W, H);

  decontaminateEdges(d, alpha, W, H);

  for (let i = 0; i < W * H; i++) d[i * 4 + 3] = Math.round(alpha[i] * 255);
  ctx.putImageData(id, 0, 0);
}

/**
 * Rechnet eine Personen-Wahrscheinlichkeitsmaske in einen Alphakanal um.
 *
 * Rein und ohne Canvas — so lässt sich die Kantenbehandlung gegen eine bekannte
 * Referenzmaske prüfen, unabhängig davon, was das Modell auf einem konkreten
 * Foto liefert.
 *
 * @param {{data: Float32Array, width: number, height: number}} mask
 * @returns {Float32Array} Alpha 0..1, Länge W*H
 */
export function maskToAlpha(mask, W, H) {
  const alpha = new Float32Array(W * H);

  // Bilinear hochziehen — eine Nächster-Nachbar-Skalierung würde an der Kante
  // Treppen erzeugen, und genau dort entscheidet sich die Qualität.
  const sx = (mask.width - 1) / Math.max(1, W - 1);
  const sy = (mask.height - 1) / Math.max(1, H - 1);

  for (let y = 0; y < H; y++) {
    const my = y * sy;
    const y0 = Math.floor(my), y1 = Math.min(mask.height - 1, y0 + 1);
    const fy = my - y0;
    for (let x = 0; x < W; x++) {
      const mx = x * sx;
      const x0 = Math.floor(mx), x1 = Math.min(mask.width - 1, x0 + 1);
      const fx = mx - x0;

      const v00 = mask.data[y0 * mask.width + x0], v10 = mask.data[y0 * mask.width + x1];
      const v01 = mask.data[y1 * mask.width + x0], v11 = mask.data[y1 * mask.width + x1];
      const v = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;

      alpha[y * W + x] = smoothstep(ALPHA_LO, ALPHA_HI, v);
    }
  }
  return alpha;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Entfernt die Hintergrundfarbe aus halbtransparenten Randpixeln.
 *
 * Ein Randpixel ist eine Mischung: C = a·F + (1-a)·B, wobei F die echte
 * Vordergrundfarbe ist und B die des Hintergrunds. Ohne Korrektur bleibt B im
 * Pixel stecken — die Person behält einen Saum in der Farbe der Wand, vor der
 * sie fotografiert wurde. Sobald die App eine andere Farbe dahinterlegt, ist
 * dieser Saum sichtbar und verfälscht genau den Eindruck, um den es geht.
 *
 * B wird aus den sicher als Hintergrund erkannten Pixeln geschätzt.
 */
export function decontaminateEdges(d, alpha, W, H) {
  let bgR = 0, bgG = 0, bgB = 0, n = 0;
  for (let i = 0; i < W * H; i++) {
    if (alpha[i] < 0.02) { bgR += d[i * 4]; bgG += d[i * 4 + 1]; bgB += d[i * 4 + 2]; n++; }
  }
  if (n < 50) return;                       // zu wenig sicherer Hintergrund
  bgR /= n; bgG /= n; bgB /= n;

  // Unterhalb dieser Deckkraft ist die Division durch a numerisch wertlos —
  // solche Pixel sind ohnehin fast unsichtbar.
  const MIN_ALPHA = 0.25;

  for (let i = 0; i < W * H; i++) {
    const a = alpha[i];
    if (a <= MIN_ALPHA || a >= 0.98) continue;
    const p = i * 4;
    d[p]     = clamp8((d[p]     - (1 - a) * bgR) / a);
    d[p + 1] = clamp8((d[p + 1] - (1 - a) * bgG) / a);
    d[p + 2] = clamp8((d[p + 2] - (1 - a) * bgB) / a);
  }
}

function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }

// ══════════════════════════════════════
// Rückweg: Flood-Fill
// ══════════════════════════════════════

/**
 * Flood-Fill vom Bildrand gegen eine geschätzte Hintergrundfarbe.
 *
 * Bleibt als Rückfallebene erhalten, wenn das Segmentierungs-Modell nicht
 * geladen werden kann. Gegenüber der ursprünglichen Fassung korrigiert:
 *
 *  - enq() setzte visited BEVOR der Abstand geprüft wurde. Ein Randpixel, das
 *    knapp über dem Schwellwert lag, war damit dauerhaft gesperrt und eine nur
 *    über dieses Pixel erreichbare Hintergrundfläche blieb stehen.
 *  - Die "Kantenglättung" setzte jedes deckende Pixel mit transparentem
 *    Nachbarn hart auf Alpha 140. Das glättete nichts, sondern stanzte einen
 *    gleichmäßig halbtransparenten Saum rund um die gesamte Silhouette —
 *    quer durchs Gesicht ebenso wie um die Schultern. Ersetzt durch ein echtes
 *    Weichzeichnen des Alphakanals im Kantenbereich.
 */
function floodFillBackground(ctx, W, H) {
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;

  let bgR = 0, bgG = 0, bgB = 0, n = 0;
  const sample = (x, y) => { const p = (y * W + x) * 4; bgR += d[p]; bgG += d[p + 1]; bgB += d[p + 2]; n++; };
  for (let x = 0; x < W; x++) { sample(x, 0); sample(x, H - 1); }
  for (let y = 0; y < H; y++) { sample(0, y); sample(W - 1, y); }
  bgR /= n; bgG /= n; bgB /= n;

  const HARD = 48, SOFT = 70;
  const dist = (p) => {
    const dr = d[p] - bgR, dg = d[p + 1] - bgG, db = d[p + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const visited = new Uint8Array(W * H);
  const queue = [];
  const enq = (x, y) => {
    const i = y * W + x;
    // FIX: visited erst setzen, wenn das Pixel wirklich Hintergrund ist.
    if (visited[i] || dist(i * 4) >= HARD) return;
    visited[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < W; x++) { enq(x, 0); enq(x, H - 1); }
  for (let y = 0; y < H; y++) { enq(0, y); enq(W - 1, y); }

  const alpha = new Float32Array(W * H).fill(1);
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    alpha[i] = 0;
    const qx = i % W, qy = (i / W) | 0;
    for (const [nx, ny] of [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]]) {
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const ni = ny * W + nx;
      if (visited[ni]) continue;
      const nd = dist(ni * 4);
      if (nd < HARD) { visited[ni] = 1; queue.push(ni); }
      else if (nd < SOFT) { visited[ni] = 1; alpha[ni] = (nd - HARD) / (SOFT - HARD); }
    }
  }

  featherAlpha(alpha, W, H);
  decontaminateEdges(d, alpha, W, H);
  for (let i = 0; i < W * H; i++) d[i * 4 + 3] = Math.round(alpha[i] * 255);
  ctx.putImageData(id, 0, 0);
}

/**
 * Weichzeichnen des Alphakanals, aber nur im Kantenbereich: Flächen, die
 * ringsum deckend oder ringsum transparent sind, bleiben unangetastet.
 */
function featherAlpha(alpha, W, H, radius = 1) {
  const src = Float32Array.from(alpha);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      let min = 1, max = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const v = src[(y + dy) * W + (x + dx)];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (max - min < 0.02) continue;      // homogene Fläche, nichts zu glätten
      let sum = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) { sum += src[(y + dy) * W + (x + dx)]; count++; }
      }
      alpha[i] = sum / count;
    }
  }
}
