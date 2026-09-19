/**
 * skinAnalysis.js — Vollständige Erscheinungsbild-Analyse
 *
 * Pipeline:
 *   1. MediaPipe Face Landmarker → Gesicht + 478 Landmarks
 *   2. Vier Regionen sampeln: Haut (Wangen/Stirn), Haar (Haaransatz), Iris, Sklera
 *   3. RGB → Lab Konvertierung je Region
 *   4. K-Means Clustering → dominante Farbe je Region
 *   5. Sklera-Weissabgleich, abgeleitete Metriken, 7-dimensionales Matching
 *
 * v6 — Korrekturen an der Analyse-Logik:
 *   - Haar-Sampling verwarf ueber isSkinColor() praktisch jede natuerliche
 *     Haarfarbe (Platinblond bis Dunkelbraun). Ersetzt durch Abgleich gegen den
 *     gemessenen Hautton dieser Person.
 *   - Matching-Tiefenachse ist L* statt ITA. ITA = atan2(L*-50, b*) mischt
 *     Helligkeit und Waerme und behauptete teils das Gegenteil der tatsaechlichen
 *     Helligkeit. ITA bleibt als dermatologische Kategorie zur Anzeige.
 *   - skinWarmth ist hue-getrieben statt b*-getrieben: b* steigt mit Melanin,
 *     der Hue-Winkel nicht. Tiefe Hauttoene wurden sonst als "warm" gelesen.
 *   - rangeScoreSmooth hatte ein Plateau von 1.0 ueber den gesamten Zielbereich,
 *     wodurch mehrere Typen gleichauf lagen und Rauschen entschied.
 *   - Nicht messbare Dimensionen sind null und fallen aus der Bewertung, statt
 *     als Platzhalter (hairDepth=50, contrast=25) mitbewertet zu werden.
 *   - Confidence misst den Abstand zu Platz 2 an der Streuung des Feldes und
 *     gewichtet ihn mit der absoluten Passgenauigkeit des Siegers.
 *
 * v5:
 *   - hairWarmth nutzt a* + b* (Kupferton-Erkennung)
 *   - Chroma als 7. Matching-Dimension (Clear vs. Soft)
 *   - DeltaE2000 statt DeltaE76 fuer Kontrast
 *   - Optionaler Sklera-Weissabgleich
 *
 * v4 — Region-Override-Support:
 *   - getAutoRegions(imageEl) → erkennt Gesicht, gibt Bounding-Boxes zurück
 *   - analyzeSkinFromRegions(imageEl, regions) → analysiert mit eigenen Regionen
 *   - getDefaultRegions() → Fallback wenn kein Gesicht erkannt
 */

import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { LANDMARKER_OPTIONS } from '../config/face.js';
import { loadFaceModelBuffer, loadVision } from '../core/faceModel.js';
import {
  rgbToLab, labToRgb, deltaE76, deltaE2000, calculateChroma, calculateHueAngle
} from '../core/color.js';
import colorTypes from '../data/colorTypes.json';

// ══════════════════════════════════════
// MediaPipe Setup
// ══════════════════════════════════════

let faceLandmarker = null;
let isInitialized = false;
// Parallele Aufrufe (Upload und "Offline vorbereiten" gleichzeitig) duerfen den
// Landmarker nicht zweimal aufbauen — ~22 MB WASM plus Modell.
let initPromise = null;

/**
 * Initialisiert den Face Landmarker einmalig.
 *
 * Laufzeit und Modell kommen aus dem eigenen Origin (public/mediapipe/wasm bzw.
 * public/models). Vorher lud die App beides vom CDN — das laesst sich vom
 * Service Worker nicht zuverlaessig cachen, die Analyse waere in der
 * installierten App ohne Netz nicht verfuegbar gewesen.
 *
 * @param {(status: string) => void} [onStatus] Fortschrittsmeldungen fuer die UI
 */
export { labToRgb };

export async function initSkinAnalysis(onStatus) {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      onStatus?.('Laufzeit wird initialisiert …');
      const vision = await loadVision();
      const modelAssetBuffer = new Uint8Array(await loadFaceModelBuffer(onStatus));
      onStatus?.('Gesichts-Erkennung wird vorbereitet …');
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer, delegate: 'GPU' },
        runningMode: 'IMAGE',
        ...LANDMARKER_OPTIONS
      });
      isInitialized = true;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function isAnalysisReady() { return isInitialized; }

// ══════════════════════════════════════
// Landmark-Regionen
// ══════════════════════════════════════

const CHEEK_LEFT = [50, 101, 118, 117, 116, 123, 147, 213];
const CHEEK_RIGHT = [280, 330, 347, 346, 345, 352, 376, 433];
const FOREHEAD = [10, 67, 69, 104, 108, 151, 337, 299, 297];
const HAIR_ANCHOR_POINTS = [10, 151, 9, 8, 107, 336];
// Aeussere Punkte des Gesichtsovals auf Wangenhoehe — geben die Kopfbreite.
const FACE_LEFT = 234;
const FACE_RIGHT = 454;
const IRIS_LEFT_CENTER = 468;
const IRIS_RIGHT_CENTER = 473;
const IRIS_LEFT = [468, 469, 470, 471, 472];
const IRIS_RIGHT = [473, 474, 475, 476, 477];

// Sklera-Landmarks (Augenweiss) fuer Weissabgleich
const SCLERA_LEFT = [33, 133, 159, 145];   // innere Augenecken links
const SCLERA_RIGHT = [362, 263, 386, 374]; // innere Augenecken rechts

// ══════════════════════════════════════
// Region-Erkennung (v4)
// ══════════════════════════════════════

export function getDefaultRegions() {
  return {
    detected: false,
    skin:      { x: 30, y: 45, w: 40, h: 20 },
    hair:      { x: 25, y: 2,  w: 50, h: 12 },
    irisLeft:  { x: 35, y: 32, w: 8,  h: 6 },
    irisRight: { x: 57, y: 32, w: 8,  h: 6 }
  };
}

export async function getAutoRegions(imageEl, onStatus) {
  if (!isInitialized) {
    try { await initSkinAnalysis(onStatus); } catch (err) {
      console.warn('MediaPipe nicht verfuegbar, nutze Defaults:', err.message);
      return getDefaultRegions();
    }
  }

  const result = faceLandmarker.detect(imageEl);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return getDefaultRegions();
  }

  const lm = result.faceLandmarks[0];
  const W = imageEl.naturalWidth || imageEl.width;
  const H = imageEl.naturalHeight || imageEl.height;

  const skinIndices = [...CHEEK_LEFT, ...CHEEK_RIGHT, ...FOREHEAD];
  const skinPts = skinIndices.map(i => ({ x: lm[i].x * W, y: lm[i].y * H }));
  const skinBox = boundingBox(skinPts, W, H, 5);

  const hr = hairRegion(lm, W, H);
  const hairBox = {
    x: (hr.minX / W) * 100,
    y: (hr.minY / H) * 100,
    w: ((hr.maxX - hr.minX) / W) * 100,
    h: ((hr.maxY - hr.minY) / H) * 100
  };

  const irisLeftBox = irisBox(lm, IRIS_LEFT_CENTER, IRIS_LEFT, W, H);
  const irisRightBox = irisBox(lm, IRIS_RIGHT_CENTER, IRIS_RIGHT, W, H);

  return {
    detected: true,
    skin: clampBox(skinBox),
    hair: clampBox(hairBox),
    irisLeft: clampBox(irisLeftBox),
    irisRight: clampBox(irisRightBox)
  };
}

/**
 * Lage des Haar-Samplings ueber dem Haaransatz.
 *
 * FIX (Breite): Die Spanne kam aus HAIR_ANCHOR_POINTS — das sind aber alles
 * Landmarks auf der Mittellinie (Stirnmitte, Glabella, Nasenwurzel, innere
 * Brauenenden). Ihre x-Spanne ist die Breite der Nasenwurzel, nicht die des
 * Kopfes. An einem echten Portraet gemessen: eine Box von 39 x 54 Pixeln, die
 * 1055 Haarpixel lieferte. Die Breite kommt jetzt aus dem Gesichtsoval.
 *
 * FIX (Hoehe): Das Band lag 5 bis 20 Prozent der Gesichtshoehe ueber dem
 * Haaransatz und traf damit die Ansatzschatten statt der Haarmasse — gemessen
 * L* 33.6 bei tatsaechlich blondem Haar. Es reicht jetzt hoeher hinauf.
 */
const HAIR_BAND_TOP = 0.42;     // Anteil der Gesichtshoehe ueber dem Haaransatz
const HAIR_BAND_BOTTOM = 0.06;
const HAIR_HALF_WIDTH = 0.40;   // Anteil der Kopfbreite je Seite der Mitte

function hairRegion(landmarks, W, H) {
  const anchors = HAIR_ANCHOR_POINTS.map(i => ({ x: landmarks[i].x * W, y: landmarks[i].y * H }));
  const topY = Math.min(...anchors.map(p => p.y));
  const chinY = landmarks[152].y * H;
  const faceHeight = chinY - topY;

  const faceLeft = landmarks[FACE_LEFT].x * W;
  const faceRight = landmarks[FACE_RIGHT].x * W;
  const centerX = (faceLeft + faceRight) / 2;
  const faceWidth = Math.abs(faceRight - faceLeft);

  return {
    minX: centerX - faceWidth * HAIR_HALF_WIDTH,
    maxX: centerX + faceWidth * HAIR_HALF_WIDTH,
    minY: Math.max(0, topY - faceHeight * HAIR_BAND_TOP),
    maxY: Math.max(0, topY - faceHeight * HAIR_BAND_BOTTOM)
  };
}

function boundingBox(pts, imgW, imgH, padding = 0) {
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const x0 = Math.max(0, Math.min(...xs) - padding);
  const y0 = Math.max(0, Math.min(...ys) - padding);
  const x1 = Math.min(imgW, Math.max(...xs) + padding);
  const y1 = Math.min(imgH, Math.max(...ys) + padding);
  return {
    x: (x0 / imgW) * 100,
    y: (y0 / imgH) * 100,
    w: ((x1 - x0) / imgW) * 100,
    h: ((y1 - y0) / imgH) * 100
  };
}

function irisBox(lm, centerIdx, ringIndices, W, H) {
  if (lm.length < 478) {
    return centerIdx === 468
      ? { x: 35, y: 32, w: 8, h: 6 }
      : { x: 57, y: 32, w: 8, h: 6 };
  }
  const cx = lm[centerIdx].x * W;
  const cy = lm[centerIdx].y * H;
  const dists = ringIndices.filter(i => i !== centerIdx).map(i => {
    const dx = lm[i].x * W - cx, dy = lm[i].y * H - cy;
    return Math.sqrt(dx * dx + dy * dy);
  });
  // Die Ring-Landmarks liegen auf dem Irisrand, ihr mittlerer Abstand IST der
  // Irisradius. Das Rechteck muss INNEN liegen: bei halber Seitenlaenge r/sqrt(2)
  // beruehrt es den Kreis gerade, 0.62 haelt zusaetzlich Abstand zum Limbus.
  //
  // FIX: hier stand der Faktor 1.2 — das Rechteck umschrieb die Iris und zog
  // Lidkante, Wimpern und Hautpartien mit hinein. An einem echten Portraet
  // gemessen las die Debug-Ansicht dadurch #665651 (braeunliches Grau) statt
  // der kreisfoermig gemessenen #444442 der App und meldete die Iris als
  // deutlich waermer, als sie ist.
  const radius = Math.max(4, dists.reduce((a, b) => a + b, 0) / dists.length * 0.62);
  return {
    x: ((cx - radius) / W) * 100,
    y: ((cy - radius) / H) * 100,
    w: (radius * 2 / W) * 100,
    h: (radius * 2 / H) * 100
  };
}

function clampBox(b) {
  const x = Math.max(0, Math.min(99, b.x));
  const y = Math.max(0, Math.min(99, b.y));
  return {
    x, y,
    w: Math.max(1, Math.min(100 - x, b.w)),
    h: Math.max(1, Math.min(100 - y, b.h))
  };
}

// ══════════════════════════════════════
// Pixel-Sampling
// ══════════════════════════════════════

function getImagePixels(imageEl) {
  const canvas = document.createElement('canvas');
  const W = imageEl.naturalWidth || imageEl.width;
  const H = imageEl.naturalHeight || imageEl.height;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageEl, 0, 0, W, H);
  return { pixels: ctx.getImageData(0, 0, W, H).data, W, H };
}

function sampleRectPixels(pixels, imgW, imgH, box, filterFn) {
  const result = [];
  const x0 = Math.round(box.x / 100 * imgW);
  const y0 = Math.round(box.y / 100 * imgH);
  const x1 = Math.min(imgW - 1, Math.round((box.x + box.w) / 100 * imgW));
  const y1 = Math.min(imgH - 1, Math.round((box.y + box.h) / 100 * imgH));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = (y * imgW + x) * 4;
      const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
      if (!filterFn || filterFn(r, g, b)) result.push([r, g, b]);
    }
  }
  return result;
}

function samplePolygonPixels(pixels, W, H, landmarks, indices, filterFn) {
  const result = [];
  const poly = indices.map(i => ({
    x: Math.round(landmarks[i].x * W),
    y: Math.round(landmarks[i].y * H)
  }));
  const minX = Math.max(0, Math.min(...poly.map(p => p.x)) - 2);
  const maxX = Math.min(W - 1, Math.max(...poly.map(p => p.x)) + 2);
  const minY = Math.max(0, Math.min(...poly.map(p => p.y)) - 2);
  const maxY = Math.min(H - 1, Math.max(...poly.map(p => p.y)) + 2);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolygon(x, y, poly)) {
        const idx = (y * W + x) * 4;
        const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
        if (!filterFn || filterFn(r, g, b)) result.push([r, g, b]);
      }
    }
  }
  return result;
}

function sampleSkinPixels(pixels, W, H, landmarks) {
  const all = [];
  for (const region of [CHEEK_LEFT, CHEEK_RIGHT, FOREHEAD]) {
    all.push(...samplePolygonPixels(pixels, W, H, landmarks, region, isSkinColor));
  }
  return all;
}

function sampleHairPixels(pixels, W, H, landmarks, skinLab, personMask) {
  const { minX, maxX, minY, maxY } = hairRegion(landmarks, W, H);

  const raw = [];
  for (let y = Math.round(minY); y <= Math.round(maxY); y++) {
    for (let x = Math.round(minX); x <= Math.round(maxX); x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      // Ein hoeheres Band trifft ueber dem Kopf auf Hintergrund. Liegt eine
      // Personenmaske vor, faellt der zuverlaessig raus — unabhaengig davon,
      // welche Farbe der Hintergrund hat.
      if (personMask && !isPerson(personMask, x / W, y / H)) continue;
      const idx = (y * W + x) * 4;
      const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 240 || lum < 5) continue;
      raw.push([r, g, b]);
    }
  }
  return rejectSkinLikePixels(raw, skinLab);
}

/** Nachschlag in der Personenmaske ueber normierte Koordinaten (0..1). */
function isPerson(mask, fx, fy) {
  const x = Math.min(mask.width - 1, Math.max(0, Math.round(fx * (mask.width - 1))));
  const y = Math.min(mask.height - 1, Math.max(0, Math.round(fy * (mask.height - 1))));
  return mask.data[y * mask.width + x] > 0.6;
}

/**
 * Entfernt Hautpixel aus einer Haar-Stichprobe.
 *
 * FIX: vorher lief hier ein pauschaler isSkinColor()-Filter (YCbCr-Box). Dessen
 * Bereich deckt praktisch jede natuerliche Haarfarbe ab — Platinblond bis
 * Dunkelbraun wurden komplett verworfen, uebrig blieben nur Schatten- und
 * Hintergrundpixel. Stattdessen wird jetzt gegen die *gemessene* Hautfarbe
 * dieser Person abgeglichen: nur was der eigenen Haut farblich sehr nahe kommt,
 * fliegt raus. Ohne bekannte Hautfarbe wird nicht gefiltert.
 */
function rejectSkinLikePixels(rgbPixels, skinLab) {
  if (!skinLab || rgbPixels.length === 0) return rgbPixels;
  const SKIN_DELTA = 12; // DeltaE76 — enger Radius um den gemessenen Hautton
  const kept = rgbPixels.filter(([r, g, b]) => deltaE76(rgbToLab(r, g, b), skinLab) > SKIN_DELTA);
  // Wuerde der Filter fast alles verwerfen, ist die Region vermutlich echtes
  // Haar in Hautton-Naehe (Blond). Dann lieber ungefiltert auswerten.
  return kept.length >= Math.max(20, rgbPixels.length * 0.15) ? kept : rgbPixels;
}

function sampleIrisPixels(pixels, W, H, landmarks) {
  const result = [];
  if (landmarks.length < 478) return result;
  for (const centerIdx of [IRIS_LEFT_CENTER, IRIS_RIGHT_CENTER]) {
    const cx = Math.round(landmarks[centerIdx].x * W);
    const cy = Math.round(landmarks[centerIdx].y * H);
    const neighborIdx = centerIdx === 468 ? IRIS_LEFT : IRIS_RIGHT;
    const dists = neighborIdx.filter(i => i !== centerIdx).map(i => {
      const dx = landmarks[i].x * W - cx, dy = landmarks[i].y * H - cy;
      return Math.sqrt(dx * dx + dy * dy);
    });
    const irisRadius = Math.max(3, Math.round(dists.reduce((a, b) => a + b, 0) / dists.length * 0.7));
    for (let dy = -irisRadius; dy <= irisRadius; dy++) {
      for (let dx = -irisRadius; dx <= irisRadius; dx++) {
        if (dx * dx + dy * dy > irisRadius * irisRadius) continue;
        const px = cx + dx, py = cy + dy;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const idx = (py * W + px) * 4;
        const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum > 200 || lum < 20) continue;
        result.push([r, g, b]);
      }
    }
  }
  return result;
}

/**
 * Sampelt Sklera-Pixel (Augenweiss) fuer Weissabgleich.
 * Nimmt kleine Bereiche nahe der inneren Augenecken.
 */
function sampleScleraPixels(pixels, W, H, landmarks, skinL) {
  // Fuer beide Augen: Bereich zwischen innerem Augenrand und Iris
  const pairs = [
    { inner: 133, outer: 33, irisCenter: IRIS_LEFT_CENTER },
    { inner: 362, outer: 263, irisCenter: IRIS_RIGHT_CENTER }
  ];

  // Radius an der Augenbreite ausrichten statt fest bei 3 Pixeln: Ein Gesicht
  // fuellt mal das halbe Bild und mal ein Achtel davon.
  const eyeWidth = Math.hypot(
    (landmarks[133].x - landmarks[33].x) * W,
    (landmarks[133].y - landmarks[33].y) * H
  );
  const radius = Math.max(2, Math.round(eyeWidth * 0.16));

  const window = [];
  for (const { inner, irisCenter } of pairs) {
    const cx = Math.round((landmarks[inner].x * W + landmarks[irisCenter].x * W) / 2);
    const cy = Math.round((landmarks[inner].y * H + landmarks[irisCenter].y * H) / 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const px = cx + dx, py = cy + dy;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const idx = (py * W + px) * 4;
        const rv = pixels[idx], gv = pixels[idx + 1], bv = pixels[idx + 2];
        window.push({ rgb: [rv, gv, bv], lum: 0.299 * rv + 0.587 * gv + 0.114 * bv });
      }
    }
  }
  if (window.length < 20) return [];

  // FIX: vorher entschied die feste Schranke lum > 120, ob ein Pixel als Sklera
  // zaehlt. An einem normal belichteten Abendportraet gemessen liegt das
  // Augenweiss im Brauenschatten bei Luminanz 51 bis 96 — kein einziges Pixel
  // kam durch, und der Weissabgleich blieb stumm aus. Die Auswahl laeuft jetzt
  // ueber Perzentile innerhalb des Fensters und ist damit belichtungsunabhaengig:
  // unten fallen Wimpern, Lidfalte und Irisrand heraus, oben die Spiegelung.
  window.sort((a, b) => a.lum - b.lum);
  const lo = Math.floor(window.length * 0.45);
  const hi = Math.floor(window.length * 0.95);
  const band = window.slice(lo, hi);
  if (!band.length) return [];

  // Im Fenster muss es ueberhaupt einen helleren Bereich geben — sonst ist das
  // Auge geschlossen oder der Messpunkt sitzt daneben.
  const dark = window[Math.floor(window.length * 0.1)].lum;
  const bright = band[Math.floor(band.length / 2)].lum;
  if (bright < dark * 1.15) return [];

  // Und die Sklera darf nicht deutlich dunkler sein als die Haut — dann liegt
  // sie so tief im Schatten, dass sie als Lichtreferenz nichts taugt.
  if (Number.isFinite(skinL) && bright < skinL * 0.9) return [];

  return band.map((p) => p.rgb);
}

// ══════════════════════════════════════
// Hilfsfunktionen
// ══════════════════════════════════════

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function isSkinColor(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.169 * r - 0.331 * g + 0.500 * b;
  const cr = 128 + 0.500 * r - 0.419 * g - 0.081 * b;
  return y > 40 && cb > 77 && cb < 127 && cr > 133 && cr < 173;
}

// ══════════════════════════════════════
// Clustering
// ══════════════════════════════════════

/**
 * Deterministischer Zufallsgenerator (mulberry32).
 *
 * k-Means++ braucht Zufall fuer die Startzentren. Mit Math.random() liefert
 * dieselbe Datei bei jedem Aufruf ein anderes Ergebnis — an einem echten Foto
 * gemessen: sechs Laeufe, zwei verschiedene Farbtypen, weil mal der beleuchtete
 * und mal der beschattete Hautcluster gewann (L* 63.9 gegen 54.7). Fuer eine
 * Beratung ist das unbrauchbar: Wer dasselbe Bild zweimal hochlaedt, muss
 * zweimal dasselbe lesen.
 */
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wie oft k-Means mit unterschiedlichen Startzentren wiederholt wird. */
const KMEANS_RESTARTS = 3;

/**
 * k-Means im Lab-Raum.
 *
 * Mehrere Durchlaeufe mit festen Startwerten; gewertet wird der mit der
 * geringsten Streuung innerhalb der Cluster. Das macht das Ergebnis nicht nur
 * reproduzierbar, sondern auch stabiler — ein einzelner unguenstiger Start
 * entscheidet nicht mehr ueber das Ergebnis.
 */
function kMeansLab(labPixels, k = 3, maxIter = 20) {
  if (labPixels.length === 0) return null;
  if (labPixels.length < k) k = Math.max(1, labPixels.length);

  let best = null;
  for (let attempt = 0; attempt < KMEANS_RESTARTS; attempt++) {
    const run = kMeansOnce(labPixels, k, maxIter, seededRandom(0x9E3779B9 + attempt * 0x85EBCA6B));
    if (!best || run.inertia < best.inertia) best = run;
  }
  return best;
}

function kMeansOnce(labPixels, k, maxIter, rnd) {
  const centers = [{ ...labPixels[Math.floor(rnd() * labPixels.length)] }];
  while (centers.length < k) {
    const dists = labPixels.map(p => Math.min(...centers.map(c => deltaE76(p, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    let r = rnd() * total, cum = 0;
    let picked = -1;
    for (let i = 0; i < labPixels.length; i++) {
      cum += dists[i];
      if (cum >= r) { picked = i; break; }
    }
    // Fliesskomma-Drift kann dazu fuehren, dass cum am Ende knapp unter r
    // bleibt — dann wuerde kein Zentrum gesetzt und die Schleife liefe endlos.
    if (picked < 0) picked = labPixels.length - 1;
    centers.push({ ...labPixels[picked] });
  }

  const asgn = new Array(labPixels.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < labPixels.length; i++) {
      let minD = Infinity, minJ = 0;
      for (let j = 0; j < k; j++) {
        const d = deltaE76(labPixels[i], centers[j]);
        if (d < minD) { minD = d; minJ = j; }
      }
      if (asgn[i] !== minJ) { asgn[i] = minJ; changed = true; }
    }
    if (!changed) break;
    for (let j = 0; j < k; j++) {
      let sL = 0, sA = 0, sB = 0, cnt = 0;
      for (let i = 0; i < labPixels.length; i++) {
        if (asgn[i] === j) { sL += labPixels[i].L; sA += labPixels[i].a; sB += labPixels[i].b; cnt++; }
      }
      if (cnt > 0) centers[j] = { L: sL / cnt, a: sA / cnt, b: sB / cnt };
    }
  }

  const sizes = new Array(k).fill(0);
  let inertia = 0;
  for (let i = 0; i < labPixels.length; i++) {
    sizes[asgn[i]]++;
    const d = deltaE76(labPixels[i], centers[asgn[i]]);
    inertia += d * d;
  }
  const domIdx = sizes.indexOf(Math.max(...sizes));
  return {
    dominant: centers[domIdx],
    all: centers.map((c, i) => ({ ...c, size: sizes[i] })),
    totalPixels: labPixels.length,
    inertia
  };
}

function averageLab(labPixels) {
  if (!labPixels.length) return null;
  const s = labPixels.reduce((a, p) => ({ L: a.L + p.L, a: a.a + p.a, b: a.b + p.b }), { L: 0, a: 0, b: 0 });
  return { L: s.L / labPixels.length, a: s.a / labPixels.length, b: s.b / labPixels.length };
}

// ══════════════════════════════════════
// Weissabgleich
// ══════════════════════════════════════

/**
 * Berechnet einen Weissabgleich-Korrekturvektor aus Sklera-Pixeln.
 * Die Sklera sollte idealerweise neutral (a*≈0, b*≈0) sein.
 * Gibt einen Offset zurueck, der auf Lab-Werte angewendet werden kann.
 */
function computeWhiteBalanceOffset(scleraRgb, skinL) {
  if (scleraRgb.length < 10) return null; // zu wenige Pixel
  const labs = scleraRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const avg = averageLab(labs);
  if (!avg) return null;

  // Ist der Bereich zu dunkel, sind es vermutlich keine Sklera-Pixel.
  //
  // FIX: die Schwelle war absolut (erst L* 60, dann 45) und damit an die
  // Belichtung gebunden — bei einem Abendportraet fiel sie durch, obwohl das
  // Augenweiss sauber gemessen war. Sie richtet sich jetzt nach der gemessenen
  // Haut: Die Sklera muss hell genug relativ zum Gesicht sein, nicht hell auf
  // einer absoluten Skala.
  const minL = Number.isFinite(skinL) ? Math.max(25, skinL * 0.55) : 45;
  if (avg.L < minL) return null;

  // Korrektur: wie weit weicht die Sklera von neutral ab? Nur a und b, nicht L.
  //
  // Bewusst nur teilweise korrigiert. Die Sklera ist kein perfektes Graureferenz:
  // Sie ist durchblutet, leicht gelblich, und der Messpunkt liegt nahe der
  // Karunkel — dem rosa Gewebe im inneren Augenwinkel. Ein Teil des gemessenen
  // a*-Ueberschusses gehoert also zum Auge und nicht zum Licht. Eine volle
  // Korrektur wuerde diesen Anteil dem Farbstich zuschlagen und den Hautton
  // systematisch zu kuehl lesen.
  const STRENGTH = 0.7;
  const MAX_CORRECTION = 8;
  const clamp = (v) => Math.max(-MAX_CORRECTION, Math.min(MAX_CORRECTION, v));
  return {
    dL: 0,
    da: -clamp(avg.a * STRENGTH),
    db: -clamp(avg.b * STRENGTH)
  };
}

/**
 * Wendet Weissabgleich-Offset auf ein Lab-Objekt an.
 */
function applyWhiteBalance(lab, offset) {
  if (!offset) return lab;
  return {
    L: lab.L,
    a: lab.a + offset.da,
    b: lab.b + offset.db
  };
}

// ══════════════════════════════════════
// Metriken
// ══════════════════════════════════════

function calculateITA(lab) { return Math.atan2(lab.L - 50, lab.b) * (180 / Math.PI); }
function itaCategory(ita) {
  if (ita > 55) return 'very_light'; if (ita > 41) return 'light'; if (ita > 28) return 'intermediate';
  if (ita > 10) return 'tan'; if (ita > -30) return 'brown'; return 'dark';
}

/**
 * Haarwaerme warm(1) .. kuehl(0), oder null wenn nicht bestimmbar.
 * Beruecksichtigt a* (Rot/Kupfer) und b* (Gelb).
 */
function hairWarmth(hairLab) {
  // FIX: schwarzes und graues Haar hat kaum Chroma — daraus laesst sich keine
  // Waerme ablesen. Vorher gab die lineare Formel hier hart 0.00 zurueck, also
  // "maximal kuehl", was jeden Dunkelhaarigen Richtung Winter geschoben hat.
  // Jetzt: null = unbestimmt, Dimension faellt aus der Bewertung.
  if (!hairLab) return null;
  const chroma = calculateChroma(hairLab);
  if (chroma < 8) return null;
  const bWarmth = (hairLab.b - 5) / 25;   // Gelb-Komponente
  const aWarmth = (hairLab.a - 2) / 20;   // Rot-Komponente (Kupfer)
  return Math.max(0, Math.min(1, bWarmth * 0.6 + aWarmth * 0.4));
}

/**
 * Iriswaerme warm(1) .. kuehl(0), oder null wenn keine Iris gemessen wurde.
 */
function irisWarmth(irisLab) {
  // FIX: gibt jetzt null statt 0.5 zurueck, wenn nichts gemessen wurde. Ein
  // erfundener Mittelwert ist keine Messung — die Dimension wird stattdessen
  // aus der Bewertung genommen und die Gewichte werden neu normiert.
  if (!irisLab) return null;
  const aComp = (irisLab.a + 5) / 25;
  const bComp = (irisLab.b + 5) / 30;
  return Math.max(0, Math.min(1, (aComp + bComp) / 2));
}

/**
 * Hautunterton warm(1) .. kuehl(0).
 *
 * FIX: die alte Formel gab dem absoluten b* 45% Gewicht. b* steigt aber mit dem
 * Melaningehalt, nicht mit dem Unterton — tiefe Hauttoene wurden dadurch
 * systematisch als "warm" gelesen und landeten im Herbst statt im Winter.
 * Der Hue-Winkel ist dagegen ueber den gesamten Fitzpatrick-Bereich stabil
 * (gemessen: kuehl 38-45 grad bei Typ I bis VI, warm 63-76 grad bei Typ I bis VI),
 * er traegt deshalb jetzt die Hauptlast. b* bestaetigt nur noch.
 * Der rosePenalty-Term entfaellt: ein hoher a* bei niedrigem b* ist per
 * Definition ein kleiner Hue-Winkel und damit bereits erfasst.
 */
function skinWarmthFromLab(skinLab) {
  if (!skinLab) return null;
  const hue = calculateHueAngle(skinLab);
  const hueWarmth = Math.max(0, Math.min(1, (hue - 42) / 24));   // 42 grad -> kuehl, 66 grad -> warm
  const bWarmth = Math.max(0, Math.min(1, (skinLab.b - 8) / 14));
  return Math.max(0, Math.min(1, hueWarmth * 0.65 + bWarmth * 0.35));
}

// ══════════════════════════════════════
// 7-Dimensionales Farbtyp-Matching
// ══════════════════════════════════════

/**
 * Zielbereiche je Farbtyp.
 *
 * FIX: die Tiefen-Achse war auf ITA kalibriert. ITA = atan2(L*-50, b*) wird von
 * b* dominiert, misst also Helligkeit UND Waerme gemischt. Konkret: ein
 * "Klarer Winter" mit L*=85.8 bekam ITA 74.3, ein "Heller Fruehling" mit dem
 * HOEHEREN L*=87.3 nur ITA 65.0 — die Achse behauptete das Gegenteil der
 * tatsaechlichen Helligkeit. Dadurch fielen kuehle Typen reihenweise aus ihrem
 * eigenen Bereich heraus. Die Matching-Achse ist jetzt L* (skinDepth), ITA
 * bleibt als dermatologische Kategorie erhalten, aber nur noch zur Anzeige.
 *
 * Die Bereiche sind Heuristiken aus der Saisonlehre, auf gemessenen Lab-Werten
 * ueber Fitzpatrick I-VI verankert. Sie duerfen (und sollen) an echten Fotos
 * nachjustiert werden.
 */
const TYPE_PROFILES = {
  spring_light: {
    skinDepth: [80, 92], skinHue: [60, 82], hairDepth: [58, 88], hairWarm: [0.45, 1.0],
    contrast: [6, 26], warmth: [0.55, 0.92], chroma: [14, 26],
    w: { skinDepth: 0.15, skinHue: 0.15, hairDepth: 0.13, hairWarm: 0.13, contrast: 0.14, warmth: 0.18, chroma: 0.12 }
  },
  spring_warm: {
    skinDepth: [72, 88], skinHue: [62, 84], hairDepth: [38, 72], hairWarm: [0.58, 1.0],
    contrast: [14, 34], warmth: [0.72, 1.0], chroma: [20, 34],
    w: { skinDepth: 0.10, skinHue: 0.16, hairDepth: 0.10, hairWarm: 0.18, contrast: 0.10, warmth: 0.22, chroma: 0.14 }
  },
  spring_clear: {
    skinDepth: [76, 90], skinHue: [58, 78], hairDepth: [24, 58], hairWarm: [0.40, 0.90],
    contrast: [32, 58], warmth: [0.58, 0.92], chroma: [18, 30],
    w: { skinDepth: 0.10, skinHue: 0.14, hairDepth: 0.10, hairWarm: 0.11, contrast: 0.24, warmth: 0.16, chroma: 0.15 }
  },
  summer_light: {
    skinDepth: [82, 93], skinHue: [34, 54], hairDepth: [56, 86], hairWarm: [0.10, 0.45],
    contrast: [6, 24], warmth: [0.02, 0.32], chroma: [7, 16],
    w: { skinDepth: 0.16, skinHue: 0.15, hairDepth: 0.14, hairWarm: 0.12, contrast: 0.13, warmth: 0.17, chroma: 0.13 }
  },
  summer_cool: {
    skinDepth: [74, 88], skinHue: [30, 50], hairDepth: [32, 64], hairWarm: [0.02, 0.38],
    contrast: [20, 42], warmth: [0.00, 0.26], chroma: [10, 20],
    w: { skinDepth: 0.11, skinHue: 0.18, hairDepth: 0.10, hairWarm: 0.13, contrast: 0.12, warmth: 0.22, chroma: 0.14 }
  },
  summer_soft: {
    skinDepth: [70, 86], skinHue: [40, 58], hairDepth: [28, 60], hairWarm: [0.15, 0.50],
    contrast: [16, 36], warmth: [0.14, 0.42], chroma: [8, 17],
    w: { skinDepth: 0.10, skinHue: 0.14, hairDepth: 0.10, hairWarm: 0.12, contrast: 0.20, warmth: 0.16, chroma: 0.18 }
  },
  autumn_soft: {
    skinDepth: [70, 86], skinHue: [58, 78], hairDepth: [28, 58], hairWarm: [0.35, 0.80],
    contrast: [18, 40], warmth: [0.55, 0.88], chroma: [17, 27],
    w: { skinDepth: 0.10, skinHue: 0.14, hairDepth: 0.10, hairWarm: 0.13, contrast: 0.20, warmth: 0.15, chroma: 0.18 }
  },
  autumn_warm: {
    skinDepth: [64, 82], skinHue: [62, 84], hairDepth: [26, 56], hairWarm: [0.60, 1.0],
    contrast: [18, 42], warmth: [0.75, 1.0], chroma: [24, 38],
    w: { skinDepth: 0.11, skinHue: 0.15, hairDepth: 0.11, hairWarm: 0.18, contrast: 0.10, warmth: 0.21, chroma: 0.14 }
  },
  autumn_deep: {
    skinDepth: [34, 68], skinHue: [56, 78], hairDepth: [8, 38], hairWarm: [0.35, 0.85],
    contrast: [22, 46], warmth: [0.60, 0.95], chroma: [18, 32],
    w: { skinDepth: 0.20, skinHue: 0.14, hairDepth: 0.15, hairWarm: 0.11, contrast: 0.10, warmth: 0.17, chroma: 0.13 }
  },
  winter_cool: {
    skinDepth: [78, 92], skinHue: [28, 48], hairDepth: [14, 46], hairWarm: [0.00, 0.32],
    contrast: [40, 68], warmth: [0.00, 0.24], chroma: [8, 18],
    w: { skinDepth: 0.11, skinHue: 0.16, hairDepth: 0.11, hairWarm: 0.11, contrast: 0.19, warmth: 0.19, chroma: 0.13 }
  },
  winter_deep: {
    skinDepth: [26, 62], skinHue: [30, 56], hairDepth: [4, 26], hairWarm: [0.00, 0.35],
    contrast: [14, 42], warmth: [0.00, 0.34], chroma: [8, 22],
    w: { skinDepth: 0.21, skinHue: 0.14, hairDepth: 0.16, hairWarm: 0.09, contrast: 0.12, warmth: 0.16, chroma: 0.12 }
  },
  winter_clear: {
    skinDepth: [76, 92], skinHue: [34, 54], hairDepth: [4, 32], hairWarm: [0.00, 0.30],
    contrast: [52, 86], warmth: [0.00, 0.30], chroma: [8, 18],
    w: { skinDepth: 0.10, skinHue: 0.14, hairDepth: 0.11, hairWarm: 0.09, contrast: 0.25, warmth: 0.17, chroma: 0.14 }
  }
};

/**
 * Bewertet alle 12 Typen.
 *
 * FIX: nicht gemessene Dimensionen (kein Haar erkannt, achromatisches Haar,
 * keine Iris) liefern jetzt null und werden uebersprungen — die verbleibenden
 * Gewichte werden neu normiert. Vorher wurden Platzhalter wie hairDepth=50 oder
 * contrast=25 als echte Messwerte in die Bewertung gegeben.
 */
function matchColorType(features) {
  const dims = [
    ['skinDepth', features.skinDepth],
    ['skinHue',   features.skinHue],
    ['hairDepth', features.hairDepth],
    ['hairWarm',  features.hairWarmth],
    ['contrast',  features.skinHairContrast],
    ['warmth',    features.overallWarmth],
    ['chroma',    features.skinChroma]
  ].filter(([, v]) => v !== null && v !== undefined && Number.isFinite(v));

  const scores = [];
  for (const [key, p] of Object.entries(TYPE_PROFILES)) {
    const fits = {};
    let score = 0, wSum = 0;
    for (const [dim, value] of dims) {
      const fit = rangeScoreSmooth(value, p[dim][0], p[dim][1]);
      fits[dim] = Math.round(fit * 100);
      score += fit * p.w[dim];
      wSum += p.w[dim];
    }
    score = wSum > 0 ? score / wSum : 0;
    scores.push({
      key, name: colorTypes[key]?.name || key, season: colorTypes[key]?.season || '',
      score: Math.round(score * 1000) / 1000, fits
    });
  }

  scores.sort((a, b) => b.score - a.score);
  const mx = scores[0].score;
  if (mx > 0) scores.forEach(s => { s.pct = Math.round((s.score / mx) * 100); });

  return {
    scores,
    confidence: computeConfidence(scores),
    dimensionsUsed: dims.map(([d]) => d)
  };
}

/**
 * Confidence in Prozent.
 *
 * FIX: vorher (scores[0]-scores[1])/scores[0]. Weil alle 12 Typen auf derselben
 * schmalen Skala liegen, kam das in 10 von 12 Faellen auf <= 11% heraus — die
 * UI stufte ab 30% als "Hoch" ein, was praktisch nie erreichbar war. Jetzt wird
 * der Abstand zu Platz 2 an der tatsaechlichen Streuung des Feldes gemessen und
 * mit der absoluten Passgenauigkeit des Siegers gewichtet: ein Ergebnis, das auf
 * keinen Typ richtig passt, bekommt auch dann keine hohe Confidence, wenn es
 * klar fuehrt.
 */
function computeConfidence(scores) {
  if (scores.length < 2) return 100;
  const best = scores[0].score;
  const spread = best - scores[scores.length - 1].score;
  if (best <= 0) return 0;

  // Wie klar fuehrt Platz 1 vor Platz 2, gemessen an der Streuung des Feldes?
  const margin = spread > 1e-6 ? (best - scores[1].score) / spread : 0;
  // Wie gut passt der Sieger ueberhaupt? (0.70 = gerade noch brauchbar)
  const absoluteFit = Math.max(0, Math.min(1, (best - 0.70) / 0.25));

  return Math.round(Math.min(1, Math.sqrt(margin) * 0.75 + absoluteFit * 0.25) * 100);
}

/**
 * Bewertet, wie gut ein Wert zu einem Zielbereich passt.
 *
 * FIX: vorher gab die Funktion fuer ALLES innerhalb des Bereichs exakt 1.0
 * zurueck. Da sich die Bereiche der 12 Typen stark ueberlappen, erreichten
 * regelmaessig mehrere Typen in allen 7 Dimensionen 1.0 und der Sieger wurde
 * durch Rauschen entschieden (gemessen: 5 von 12 Archetypen falsch, teils mit
 * 0% Abstand). Innerhalb des Bereichs zaehlt jetzt der Abstand zur Mitte:
 * mittig = 1.0, am Rand = PLATEAU_FLOOR. Ausserhalb bleibt der Gauss-Abfall.
 */
const PLATEAU_FLOOR = 0.82;

function rangeScoreSmooth(value, min, max) {
  const halfRange = (max - min) / 2;
  if (halfRange <= 0) return value === min ? 1.0 : 0;
  const center = (min + max) / 2;

  if (value >= min && value <= max) {
    const rel = Math.abs(value - center) / halfRange;   // 0 = Mitte, 1 = Rand
    return 1.0 - (1.0 - PLATEAU_FLOOR) * rel * rel;
  }

  const sigma = halfRange * 0.7;
  const dist = value < min ? min - value : value - max;
  return PLATEAU_FLOOR * Math.exp(-(dist * dist) / (2 * sigma * sigma));
}

// ══════════════════════════════════════
// Aufnahmequalitaet
// ══════════════════════════════════════

/**
 * Beurteilt, ob das Foto eine belastbare Farbanalyse zulaesst.
 *
 * Ohne diese Pruefung gibt die App auf ein ungeeignetes Foto genauso
 * selbstbewusst einen Farbtyp aus wie auf ein gutes. An einem Abendportraet
 * unter Kunstlicht gemessen: Hautchroma 35.7 statt 16.7 bei Tageslicht, der
 * Weissabgleich an der Kappungsgrenze, drei Farbtypen innerhalb von 17 Punkten.
 * Das Ergebnis ist dann kein Ergebnis, und der Nutzer soll erfahren, woran es
 * liegt — die Aufnahmehinweise der App nennen genau diese Punkte.
 *
 * Die Schwellen sind an zwei echten Aufnahmen derselben Person kalibriert
 * (Tageslicht gegen Abendlicht) und bewusst grosszuegig: Ein Hinweis, der zu
 * oft erscheint, wird ignoriert.
 */
function assessQuality({ skinCluster, features, wbOffset, confidence }) {
  const hints = [];

  // Farbstich: Weissabgleich an der Kappungsgrenze (+-8)
  if (wbOffset && (Math.abs(wbOffset.da) >= 7.9 || Math.abs(wbOffset.db) >= 7.9)) {
    hints.push('Starker Farbstich im Foto — vermutlich Kunstlicht. Tageslicht am Fenster liefert deutlich verlässlichere Werte.');
  }

  // Selbst nach Korrektur zu bunte Haut: Restfarbstich, Rötung oder Schatten
  if (features.skinChroma > 28) {
    hints.push('Der Hautton misst ungewöhnlich farbintensiv. Das deutet auf farbiges Licht, Rötung oder starke Schatten hin.');
  }

  // Ungleichmaessige Ausleuchtung: Streuung zwischen den Hautclustern
  const big = skinCluster?.all?.filter((c) => c.size > skinCluster.totalPixels * 0.12) ?? [];
  if (big.length > 1) {
    const spread = Math.max(...big.map((c) => c.L)) - Math.min(...big.map((c) => c.L));
    if (spread > 14) {
      hints.push('Das Gesicht ist ungleichmäßig ausgeleuchtet. Licht von vorne statt von der Seite oder von oben.');
    }
  }

  // Zu kleine Stichprobe
  if (skinCluster && skinCluster.totalPixels < 8000) {
    hints.push('Wenig auswertbare Hautfläche — geh näher heran oder halte die Kamera auf Augenhöhe.');
  }

  return { reliable: hints.length === 0 && confidence >= 30, hints };
}

// ══════════════════════════════════════
// Feature-Berechnung (gemeinsame Pipeline)
// ══════════════════════════════════════

/**
 * Berechnet Features + Matching aus rohen Lab-Werten.
 */
function computeFeaturesAndMatch(skinLab, hairLab, irisLab, skinCluster, hairCluster, skinCount, hairCount, irisCount, wbOffset) {
  // Weissabgleich anwenden falls vorhanden
  const skinLabWb = applyWhiteBalance(skinLab, wbOffset);
  const hairLabWb = hairLab ? applyWhiteBalance(hairLab, wbOffset) : null;
  const irisLabWb = irisLab ? applyWhiteBalance(irisLab, wbOffset) : null;

  const skinIta = calculateITA(skinLabWb);
  const skinHue = calculateHueAngle(skinLabWb);
  const skinChroma = calculateChroma(skinLabWb);
  // FIX: nicht messbare Groessen sind jetzt null statt Platzhalter (vorher
  // contrast=25, irisContrast=20, hairDepth=50) — matchColorType laesst die
  // Dimension dann weg, statt eine erfundene Zahl mitzubewerten.
  const skinHairContrast = hairLabWb ? deltaE2000(skinLabWb, hairLabWb) : null;
  const skinIrisContrast = irisLabWb ? deltaE2000(skinLabWb, irisLabWb) : null;
  const hw = hairWarmth(hairLabWb);
  const iw = irisWarmth(irisLabWb);
  const sw = skinWarmthFromLab(skinLabWb);

  // Gesamtwaerme ueber die tatsaechlich vorhandenen Signale, Gewichte neu
  // normiert. Haut traegt die Hauptlast; die Iris ist genetisch unabhaengig vom
  // Hautunterton und zaehlt deshalb nur noch schwach mit (vorher 25%).
  const warmthParts = [[sw, 0.50], [hw, 0.35], [iw, 0.15]].filter(([v]) => v !== null);
  const warmthWeight = warmthParts.reduce((a, [, w]) => a + w, 0);
  const overallWarmth = warmthWeight > 0
    ? warmthParts.reduce((a, [v, w]) => a + v * w, 0) / warmthWeight
    : null;

  const features = {
    skinDepth: skinLabWb.L,
    skinIta, skinHue, skinChroma, skinItaCategory: itaCategory(skinIta),
    hairDepth: hairLabWb ? hairLabWb.L : null, hairWarmth: hw, irisWarmth: iw,
    skinHairContrast, skinIrisContrast, overallWarmth, skinWarmth: sw,
    whiteBalanceApplied: !!wbOffset
  };

  const { scores, confidence, dimensionsUsed } = matchColorType(features);
  const quality = assessQuality({ skinCluster, features, wbOffset, confidence });

  return {
    success: true,
    skin: { lab: skinLabWb, labRaw: skinLab, rgb: labToRgb(skinLabWb), cluster: skinCluster, pixelCount: skinCount },
    hair: { lab: hairLabWb, labRaw: hairLab, rgb: hairLabWb ? labToRgb(hairLabWb) : null, cluster: hairCluster, pixelCount: hairCount },
    iris: { lab: irisLabWb, labRaw: irisLab, rgb: irisLabWb ? labToRgb(irisLabWb) : null, pixelCount: irisCount },
    features, scores, topType: scores[0].key, topConfidence: confidence,
    dimensionsUsed, quality,
    whiteBalance: wbOffset ? { offset: wbOffset } : null
  };
}

// ══════════════════════════════════════
// Haupt-Analyse (Landmark-basiert)
// ══════════════════════════════════════

export async function analyzeSkin(imageEl, onStatus, personMask = null) {
  if (!isInitialized) {
    try { await initSkinAnalysis(onStatus); } catch (err) {
      return { success: false, error: 'Gesichts-Erkennung konnte nicht geladen werden: ' + err.message };
    }
  }

  const result = faceLandmarker.detect(imageEl);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return { success: false, error: 'Kein Gesicht erkannt.' };
  }

  const landmarks = result.faceLandmarks[0];
  const { pixels, W, H } = getImagePixels(imageEl);

  // Haut zuerst: Sie ist die Bezugsgroesse dafuer, ob die Sklera hell genug
  // gemessen wurde, um als Lichtreferenz zu taugen.
  const skinRgb = sampleSkinPixels(pixels, W, H, landmarks);
  if (skinRgb.length < 50) return { success: false, error: `Zu wenige Hautpixel (${skinRgb.length}).` };
  const skinLabs = skinRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const skinCluster = kMeansLab(skinLabs, 3);
  const skinLab = skinCluster.dominant;

  // Sklera-Weissabgleich
  const scleraRgb = sampleScleraPixels(pixels, W, H, landmarks, skinLab.L);
  const wbOffset = computeWhiteBalanceOffset(scleraRgb, skinLab.L);
  if (wbOffset) {
    console.log('[skinAnalysis] Weissabgleich angewendet:', wbOffset, `(${scleraRgb.length} Sklera-Pixel)`);
  }

  const hairRgb = sampleHairPixels(pixels, W, H, landmarks, skinLab, personMask);
  const hairLabs = hairRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const hairCluster = hairRgb.length >= 20 ? kMeansLab(hairLabs, 2) : null;
  const hairLab = hairCluster ? hairCluster.dominant : (hairLabs.length > 0 ? averageLab(hairLabs) : null);

  const irisRgb = sampleIrisPixels(pixels, W, H, landmarks);
  const irisLabs = irisRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const irisLab = irisLabs.length >= 5 ? averageLab(irisLabs) : null;

  return computeFeaturesAndMatch(skinLab, hairLab, irisLab, skinCluster, hairCluster, skinRgb.length, hairRgb.length, irisRgb.length, wbOffset);
}

// ══════════════════════════════════════
// Region-basierte Analyse
// ══════════════════════════════════════

export function analyzeSkinFromRegions(imageEl, regions) {
  const { pixels, W, H } = getImagePixels(imageEl);

  // Haut — mit Skin-Color-Filter
  let skinRgb = sampleRectPixels(pixels, W, H, regions.skin, isSkinColor);
  if (skinRgb.length < 20) {
    const skinRgbAll = sampleRectPixels(pixels, W, H, regions.skin);
    if (skinRgbAll.length < 10) {
      return { success: false, error: `Zu wenige Hautpixel (${skinRgbAll.length}). Marker verschieben.` };
    }
    skinRgb = skinRgbAll;
  }
  const skinLabs = skinRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const skinCluster = kMeansLab(skinLabs, 3);
  const skinLab = skinCluster.dominant;

  // Haar
  const hairRgbRaw = sampleRectPixels(pixels, W, H, regions.hair).filter(([r, g, b]) => {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 5 && lum < 240;
  });
  // FIX: beide Analyse-Pfade filtern Haar jetzt identisch — vorher lieferte
  // dasselbe Foto je nach Pfad unterschiedliche Ergebnisse.
  const hairRgb = rejectSkinLikePixels(hairRgbRaw, skinLab);
  const hairLabs = hairRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const hairCluster = hairRgb.length >= 20 ? kMeansLab(hairLabs, 2) : null;
  const hairLab = hairCluster ? hairCluster.dominant : (hairLabs.length > 0 ? averageLab(hairLabs) : null);

  // Iris
  const irisRgbL = sampleRectPixels(pixels, W, H, regions.irisLeft);
  const irisRgbR = sampleRectPixels(pixels, W, H, regions.irisRight);
  const irisRgbAll = [...irisRgbL, ...irisRgbR].filter(([r, g, b]) => {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 20 && lum < 200;
  });
  const irisLabs = irisRgbAll.map(([r, g, b]) => rgbToLab(r, g, b));
  const irisLab = irisLabs.length >= 5 ? averageLab(irisLabs) : null;

  // Kein Sklera-Weissabgleich bei manuellen Regionen (kein Landmark-Zugriff)
  return computeFeaturesAndMatch(skinLab, hairLab, irisLab, skinCluster, hairCluster, skinRgb.length, hairRgb.length, irisRgbAll.length, null);
}

// ══════════════════════════════════════
// Debug-Visualisierung
// ══════════════════════════════════════

export function debugDrawRegions(imageEl, targetCanvas) {
  if (!faceLandmarker) return null;
  const result = faceLandmarker.detect(imageEl);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;
  const landmarks = result.faceLandmarks[0];
  const W = imageEl.naturalWidth || imageEl.width;
  const H = imageEl.naturalHeight || imageEl.height;
  targetCanvas.width = W; targetCanvas.height = H;
  const ctx = targetCanvas.getContext('2d');
  ctx.drawImage(imageEl, 0, 0, W, H);

  // Haut (blau)
  for (const region of [CHEEK_LEFT, CHEEK_RIGHT, FOREHEAD]) {
    drawPoly(ctx, landmarks, region, W, H, 'rgba(74, 127, 165, 0.35)');
  }
  // Haar (orange)
  const anchors = HAIR_ANCHOR_POINTS.map(i => ({ x: landmarks[i].x * W, y: landmarks[i].y * H }));
  const topY = Math.min(...anchors.map(p => p.y));
  const chinY = landmarks[152].y * H;
  const fH = chinY - topY;
  const hL = Math.min(...anchors.map(p => p.x)) + 10, hR = Math.max(...anchors.map(p => p.x)) - 10;
  const hT = Math.max(0, topY - fH * 0.20), hB = Math.max(0, topY - fH * 0.05);
  ctx.fillStyle = 'rgba(180, 130, 60, 0.35)'; ctx.fillRect(hL, hT, hR - hL, hB - hT);
  ctx.strokeStyle = 'rgba(180, 130, 60, 0.7)'; ctx.lineWidth = 2; ctx.strokeRect(hL, hT, hR - hL, hB - hT);

  // Iris (gruen)
  if (landmarks.length >= 478) {
    for (const ci of [IRIS_LEFT_CENTER, IRIS_RIGHT_CENTER]) {
      ctx.beginPath(); ctx.arc(landmarks[ci].x * W, landmarks[ci].y * H, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(100, 180, 100, 0.35)'; ctx.fill();
      ctx.strokeStyle = 'rgba(100, 180, 100, 0.7)'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // Sklera (cyan) — zur Visualisierung des Weissabgleichs
  const scleraPairs = [
    { inner: 133, irisCenter: IRIS_LEFT_CENTER },
    { inner: 362, irisCenter: IRIS_RIGHT_CENTER }
  ];
  for (const { inner, irisCenter } of scleraPairs) {
    const cx = ((landmarks[inner].x + landmarks[irisCenter].x) / 2) * W;
    const cy = ((landmarks[inner].y + landmarks[irisCenter].y) / 2) * H;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 200, 220, 0.5)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0, 200, 220, 0.8)'; ctx.lineWidth = 1; ctx.stroke();
  }

  return result;
}

function drawPoly(ctx, landmarks, indices, W, H, color) {
  ctx.beginPath();
  ctx.moveTo(landmarks[indices[0]].x * W, landmarks[indices[0]].y * H);
  for (let i = 1; i < indices.length; i++) ctx.lineTo(landmarks[indices[i]].x * W, landmarks[indices[i]].y * H);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = color.replace('0.35', '0.7'); ctx.lineWidth = 2; ctx.stroke();
}
