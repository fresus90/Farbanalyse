/**
 * skinAnalysis.js — Vollständige Erscheinungsbild-Analyse
 *
 * Pipeline:
 *   1. MediaPipe Face Landmarker → Gesicht + 478 Landmarks
 *   2. Drei Regionen sampeln: Haut (Wangen), Haar (Haaransatz), Iris
 *   3. RGB → Lab Konvertierung je Region
 *   4. K-Means Clustering → dominante Farbe je Region
 *   5. Abgeleitete Metriken: ITA, Hue Angle, Chroma, Kontrast Haut↔Haar↔Iris
 *   6. 7-Dimensionales Farbtyp-Matching mit typ-spezifischen Gewichten
 *
 * v5 — Verbesserte Metriken:
 *   - skinWarmth nutzt a* + b* (Rosé vs. Pfirsich-Erkennung)
 *   - hairWarmth nutzt a* + b* (Kupferton-Erkennung)
 *   - Chroma als 7. Matching-Dimension (Clear vs. Soft)
 *   - DeltaE2000 statt DeltaE76 für Kontrast
 *   - Optionaler Sklera-Weißabgleich
 *
 * v4 — Region-Override-Support:
 *   - getAutoRegions(imageEl) → erkennt Gesicht, gibt Bounding-Boxes zurück
 *   - analyzeSkinFromRegions(imageEl, regions) → analysiert mit benutzerdefinierten Regionen
 *   - getDefaultRegions() → Fallback wenn kein Gesicht erkannt
 */

import { $ } from '../state.js';
import colorTypes from '../data/colorTypes.json';

// ══════════════════════════════════════
// MediaPipe Setup
// ══════════════════════════════════════

let faceLandmarker = null;
let isInitialized = false;

export async function initSkinAnalysis() {
  if (isInitialized) return;
  const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest';
  const module = await import(/* @vite-ignore */ `${VISION_CDN}/vision_bundle.mjs`);
  const { FaceLandmarker, FilesetResolver } = module;
  const vision = await FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
  });
  isInitialized = true;
}

export function isAnalysisReady() { return isInitialized; }

// ══════════════════════════════════════
// Landmark-Regionen
// ══════════════════════════════════════

const CHEEK_LEFT = [50, 101, 118, 117, 116, 123, 147, 213];
const CHEEK_RIGHT = [280, 330, 347, 346, 345, 352, 376, 433];
const FOREHEAD = [10, 67, 69, 104, 108, 151, 337, 299, 297];
const HAIR_ANCHOR_POINTS = [10, 151, 9, 8, 107, 336];
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

export async function getAutoRegions(imageEl) {
  if (!isInitialized) {
    try { await initSkinAnalysis(); } catch (err) {
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

  const anchors = HAIR_ANCHOR_POINTS.map(i => ({ x: lm[i].x * W, y: lm[i].y * H }));
  const topY = Math.min(...anchors.map(p => p.y));
  const chinY = lm[152].y * H;
  const faceHeight = chinY - topY;
  const hairTop = Math.max(0, topY - faceHeight * 0.20);
  const hairBot = Math.max(0, topY - faceHeight * 0.05);
  const hairLeft = Math.min(...anchors.map(p => p.x)) + 10;
  const hairRight = Math.max(...anchors.map(p => p.x)) - 10;
  const hairBox = {
    x: (hairLeft / W) * 100,
    y: (hairTop / H) * 100,
    w: ((hairRight - hairLeft) / W) * 100,
    h: ((hairBot - hairTop) / H) * 100
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
  const radius = Math.max(4, dists.reduce((a, b) => a + b, 0) / dists.length * 1.2);
  return {
    x: ((cx - radius) / W) * 100,
    y: ((cy - radius) / H) * 100,
    w: (radius * 2 / W) * 100,
    h: (radius * 2 / H) * 100
  };
}

function clampBox(b) {
  return {
    x: Math.max(0, Math.min(100, b.x)),
    y: Math.max(0, Math.min(100, b.y)),
    w: Math.max(1, Math.min(100 - b.x, b.w)),
    h: Math.max(1, Math.min(100 - b.y, b.h))
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

function sampleHairPixels(pixels, W, H, landmarks) {
  const result = [];
  const anchors = HAIR_ANCHOR_POINTS.map(i => ({
    x: Math.round(landmarks[i].x * W),
    y: Math.round(landmarks[i].y * H)
  }));
  const topY = Math.min(...anchors.map(p => p.y));
  const chinY = Math.round(landmarks[152].y * H);
  const faceHeight = chinY - topY;
  const sampleStart = Math.max(0, topY - Math.round(faceHeight * 0.20));
  const sampleEnd = Math.max(0, topY - Math.round(faceHeight * 0.05));
  const minX = Math.min(...anchors.map(p => p.x)) + 10;
  const maxX = Math.max(...anchors.map(p => p.x)) - 10;

  for (let y = sampleStart; y <= sampleEnd; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const idx = (y * W + x) * 4;
      const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 240 || lum < 5) continue;
      if (isSkinColor(r, g, b)) continue;
      result.push([r, g, b]);
    }
  }
  return result;
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
function sampleScleraPixels(pixels, W, H, landmarks) {
  const result = [];
  // Fuer beide Augen: kleiner Bereich zwischen innerem Augenrand und Iris
  const pairs = [
    { inner: 133, outer: 33, irisCenter: IRIS_LEFT_CENTER },
    { inner: 362, outer: 263, irisCenter: IRIS_RIGHT_CENTER }
  ];
  for (const { inner, outer, irisCenter } of pairs) {
    // Mitte zwischen innerem Rand und Iris-Zentrum
    const ix = landmarks[inner].x * W;
    const iy = landmarks[inner].y * H;
    const icx = landmarks[irisCenter].x * W;
    const icy = landmarks[irisCenter].y * H;
    const cx = Math.round((ix + icx) / 2);
    const cy = Math.round((iy + icy) / 2);
    const r = 3; // kleiner Radius
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = cx + dx, py = cy + dy;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const idx = (py * W + px) * 4;
        const rv = pixels[idx], gv = pixels[idx + 1], bv = pixels[idx + 2];
        const lum = 0.299 * rv + 0.587 * gv + 0.114 * bv;
        // Sklera sollte hell sein
        if (lum > 120 && lum < 250) result.push([rv, gv, bv]);
      }
    }
  }
  return result;
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
// Farbraum
// ══════════════════════════════════════

function rgbToLab(r, g, b) {
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

// DeltaE76 — beibehalten fuer Clustering (schnell)
function deltaE76(lab1, lab2) {
  const dL = lab1.L - lab2.L, da = lab1.a - lab2.a, db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * DeltaE2000 — perzeptuell gleichmaessigere Farbdifferenz.
 * Wird fuer Kontrast-Berechnung Haut↔Haar und Haut↔Iris verwendet.
 */
function deltaE2000(lab1, lab2) {
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
  if (Math.abs(dHp) > 180) {
    dHp += (dHp > 0) ? -360 : 360;
  }

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp2 = 2 * Math.sqrt(C1p * C2p) * Math.sin(dHp * Math.PI / 360);

  let avgHp = (h1p + h2p) / 2;
  if (Math.abs(h1p - h2p) > 180) {
    avgHp += (avgHp < 180) ? 180 : -180;
  }

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

  const dE = Math.sqrt(
    (dLp / SL) * (dLp / SL) +
    (dCp / SC) * (dCp / SC) +
    (dHp2 / SH) * (dHp2 / SH) +
    RT * (dCp / SC) * (dHp2 / SH)
  );

  return dE;
}

// ══════════════════════════════════════
// Clustering
// ══════════════════════════════════════

function kMeansLab(labPixels, k = 3, maxIter = 20) {
  if (labPixels.length === 0) return null;
  if (labPixels.length < k) k = Math.max(1, labPixels.length);
  const centers = [{ ...labPixels[Math.floor(Math.random() * labPixels.length)] }];
  while (centers.length < k) {
    const dists = labPixels.map(p => Math.min(...centers.map(c => deltaE76(p, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total, cum = 0;
    for (let i = 0; i < labPixels.length; i++) {
      cum += dists[i];
      if (cum >= r) { centers.push({ ...labPixels[i] }); break; }
    }
  }
  let asgn = new Array(labPixels.length).fill(0);
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
  for (const a of asgn) sizes[a]++;
  const domIdx = sizes.indexOf(Math.max(...sizes));
  return { dominant: centers[domIdx], all: centers.map((c, i) => ({ ...c, size: sizes[i] })), totalPixels: labPixels.length };
}

function averageLab(labPixels) {
  if (!labPixels.length) return null;
  const s = labPixels.reduce((a, p) => ({ L: a.L + p.L, a: a.a + p.a, b: a.b + p.b }), { L: 0, a: 0, b: 0 });
  return { L: s.L / labPixels.length, a: s.a / labPixels.length, b: s.b / labPixels.length };
}

// ══════════════════════════════════════
// Weissabgleich (v5 NEU)
// ══════════════════════════════════════

/**
 * Berechnet einen Weissabgleich-Korrekturvektor aus Sklera-Pixeln.
 * Die Sklera sollte idealerweise neutral (a*≈0, b*≈0) sein.
 * Gibt einen Offset zurueck, der auf Lab-Werte angewendet werden kann.
 */
function computeWhiteBalanceOffset(scleraRgb) {
  if (scleraRgb.length < 10) return null; // zu wenige Pixel
  const labs = scleraRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const avg = averageLab(labs);
  if (!avg) return null;

  // Sklera sollte hoch-L, neutral a/b sein
  // Wenn L zu niedrig, sind es vermutlich keine Sklera-Pixel
  if (avg.L < 60) return null;

  // Korrektur: wie weit weicht Sklera von neutral ab?
  // Wir korrigieren nur a und b, nicht L
  // Begrenzen auf max ±8 um ueberkorrektur zu vermeiden
  const maxCorrection = 8;
  return {
    dL: 0,
    da: -Math.max(-maxCorrection, Math.min(maxCorrection, avg.a)),
    db: -Math.max(-maxCorrection, Math.min(maxCorrection, avg.b * 0.7)) // b weniger stark korrigieren
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
// Metriken (v5 VERBESSERT)
// ══════════════════════════════════════

function calculateITA(lab) { return Math.atan2(lab.L - 50, lab.b) * (180 / Math.PI); }
function itaCategory(ita) {
  if (ita > 55) return 'very_light'; if (ita > 41) return 'light'; if (ita > 28) return 'intermediate';
  if (ita > 10) return 'tan'; if (ita > -30) return 'brown'; return 'dark';
}
function calculateHueAngle(lab) { let h = Math.atan2(lab.b, lab.a) * (180 / Math.PI); return h < 0 ? h + 360 : h; }
function calculateChroma(lab) { return Math.sqrt(lab.a * lab.a + lab.b * lab.b); }

/**
 * v5: Verbesserte hairWarmth — beruecksichtigt a* (Rot) UND b* (Gelb).
 * Kupfertöne (hoher a*, moderater b*) werden jetzt korrekt als warm erkannt.
 */
function hairWarmth(hairLab) {
  if (!hairLab) return 0.5;
  const bWarmth = (hairLab.b - 5) / 25;   // Gelb-Komponente
  const aWarmth = (hairLab.a - 2) / 20;   // Rot-Komponente (Kupfer)
  return Math.max(0, Math.min(1, bWarmth * 0.6 + aWarmth * 0.4));
}

/**
 * v5: irisWarmth — beibehalten, leicht angepasste Skalierung.
 */
function irisWarmth(irisLab) {
  if (!irisLab) return 0.5;
  const aComp = (irisLab.a + 5) / 25;
  const bComp = (irisLab.b + 5) / 30;
  return Math.max(0, Math.min(1, (aComp + bComp) / 2));
}

/**
 * v5: Verbesserte skinWarmth — beruecksichtigt a* UND Hue Angle.
 * Rose (hoher a*, niedriger b*) → kuehler Unterton.
 * Pfirsich/Gold (hoher b*, moderater a*) → warmer Unterton.
 */
function skinWarmthFromLab(skinLab) {
  if (!skinLab) return 0.5;
  const hue = calculateHueAngle(skinLab);
  // Hue-basierte Waerme (wie vorher, aber ergaenzt)
  const hueWarmth = Math.max(0, Math.min(1, (hue - 25) / 55));
  // b*-basierte Waerme: hoher b* = gelblich/warm
  const bWarmth = Math.max(0, Math.min(1, (skinLab.b - 5) / 25));
  // a*-basierte Kuehle: hoher a* relativ zu b* = rosafarben/kuehl
  // Wenn a* hoch und b* niedrig → Rose → kuehler
  const abRatio = skinLab.b > 1 ? skinLab.a / skinLab.b : skinLab.a;
  const rosePenalty = Math.max(0, Math.min(0.3, (abRatio - 0.8) * 0.15));

  return Math.max(0, Math.min(1, hueWarmth * 0.45 + bWarmth * 0.45 - rosePenalty));
}

// ══════════════════════════════════════
// 7-Dimensionales Farbtyp-Matching (v5)
// ══════════════════════════════════════

const TYPE_PROFILES = {
  spring_light: {
    skinIta: [40, 78], skinHue: [50, 80], hairDepth: [55, 85], hairWarm: [0.50, 1.0],
    contrast: [10, 35], warmth: [0.55, 0.85], chroma: [12, 25],
    w: { skinIta: 0.13, skinHue: 0.13, hairDepth: 0.13, hairWarm: 0.18, contrast: 0.13, warmth: 0.18, chroma: 0.12 }
  },
  spring_warm: {
    skinIta: [20, 62], skinHue: [55, 85], hairDepth: [35, 70], hairWarm: [0.60, 1.0],
    contrast: [15, 40], warmth: [0.65, 1.0], chroma: [15, 30],
    w: { skinIta: 0.08, skinHue: 0.13, hairDepth: 0.08, hairWarm: 0.22, contrast: 0.08, warmth: 0.27, chroma: 0.14 }
  },
  spring_clear: {
    skinIta: [28, 68], skinHue: [45, 75], hairDepth: [20, 65], hairWarm: [0.40, 0.85],
    contrast: [35, 70], warmth: [0.50, 0.80], chroma: [20, 40],
    w: { skinIta: 0.08, skinHue: 0.12, hairDepth: 0.08, hairWarm: 0.12, contrast: 0.25, warmth: 0.17, chroma: 0.18 }
  },
  summer_light: {
    skinIta: [42, 80], skinHue: [30, 58], hairDepth: [50, 82], hairWarm: [0.10, 0.45],
    contrast: [8, 30], warmth: [0.15, 0.42], chroma: [8, 20],
    w: { skinIta: 0.15, skinHue: 0.13, hairDepth: 0.15, hairWarm: 0.16, contrast: 0.11, warmth: 0.16, chroma: 0.14 }
  },
  summer_cool: {
    skinIta: [28, 68], skinHue: [25, 55], hairDepth: [30, 65], hairWarm: [0.05, 0.40],
    contrast: [15, 40], warmth: [0.10, 0.38], chroma: [8, 22],
    w: { skinIta: 0.10, skinHue: 0.17, hairDepth: 0.08, hairWarm: 0.17, contrast: 0.08, warmth: 0.25, chroma: 0.15 }
  },
  summer_soft: {
    skinIta: [22, 60], skinHue: [32, 62], hairDepth: [30, 60], hairWarm: [0.15, 0.50],
    contrast: [8, 28], warmth: [0.20, 0.48], chroma: [5, 16],
    w: { skinIta: 0.08, skinHue: 0.12, hairDepth: 0.08, hairWarm: 0.15, contrast: 0.22, warmth: 0.17, chroma: 0.18 }
  },
  autumn_soft: {
    skinIta: [18, 52], skinHue: [48, 78], hairDepth: [28, 58], hairWarm: [0.35, 0.70],
    contrast: [8, 28], warmth: [0.42, 0.68], chroma: [8, 18],
    w: { skinIta: 0.08, skinHue: 0.12, hairDepth: 0.08, hairWarm: 0.15, contrast: 0.22, warmth: 0.17, chroma: 0.18 }
  },
  autumn_warm: {
    skinIta: [5, 42], skinHue: [55, 85], hairDepth: [18, 50], hairWarm: [0.55, 1.0],
    contrast: [15, 42], warmth: [0.60, 1.0], chroma: [15, 30],
    w: { skinIta: 0.08, skinHue: 0.13, hairDepth: 0.08, hairWarm: 0.22, contrast: 0.08, warmth: 0.27, chroma: 0.14 }
  },
  autumn_deep: {
    skinIta: [-30, 25], skinHue: [50, 80], hairDepth: [8, 35], hairWarm: [0.35, 0.80],
    contrast: [10, 35], warmth: [0.45, 0.78], chroma: [10, 25],
    w: { skinIta: 0.17, skinHue: 0.13, hairDepth: 0.17, hairWarm: 0.13, contrast: 0.08, warmth: 0.17, chroma: 0.15 }
  },
  winter_cool: {
    skinIta: [32, 72], skinHue: [22, 52], hairDepth: [25, 60], hairWarm: [0.00, 0.35],
    contrast: [25, 55], warmth: [0.05, 0.32], chroma: [8, 22],
    w: { skinIta: 0.10, skinHue: 0.15, hairDepth: 0.08, hairWarm: 0.15, contrast: 0.13, warmth: 0.24, chroma: 0.15 }
  },
  winter_deep: {
    skinIta: [-35, 22], skinHue: [25, 58], hairDepth: [5, 30], hairWarm: [0.05, 0.40],
    contrast: [30, 70], warmth: [0.10, 0.38], chroma: [10, 28],
    w: { skinIta: 0.15, skinHue: 0.10, hairDepth: 0.17, hairWarm: 0.10, contrast: 0.20, warmth: 0.13, chroma: 0.15 }
  },
  winter_clear: {
    skinIta: [22, 65], skinHue: [22, 52], hairDepth: [8, 40], hairWarm: [0.00, 0.30],
    contrast: [38, 75], warmth: [0.05, 0.30], chroma: [18, 38],
    w: { skinIta: 0.07, skinHue: 0.12, hairDepth: 0.08, hairWarm: 0.12, contrast: 0.27, warmth: 0.17, chroma: 0.17 }
  }
};

function matchColorType(features) {
  const { skinIta, skinHue, hairDepth, hairWarmth: hw, skinHairContrast, overallWarmth, skinChroma } = features;
  const scores = [];
  for (const [key, p] of Object.entries(TYPE_PROFILES)) {
    const fits = {
      skinIta: rangeScoreSmooth(skinIta, p.skinIta[0], p.skinIta[1]),
      skinHue: rangeScoreSmooth(skinHue, p.skinHue[0], p.skinHue[1]),
      hairDepth: rangeScoreSmooth(hairDepth, p.hairDepth[0], p.hairDepth[1]),
      hairWarm: rangeScoreSmooth(hw, p.hairWarm[0], p.hairWarm[1]),
      contrast: rangeScoreSmooth(skinHairContrast, p.contrast[0], p.contrast[1]),
      warmth: rangeScoreSmooth(overallWarmth, p.warmth[0], p.warmth[1]),
      chroma: rangeScoreSmooth(skinChroma, p.chroma[0], p.chroma[1])
    };
    const score = fits.skinIta * p.w.skinIta + fits.skinHue * p.w.skinHue +
      fits.hairDepth * p.w.hairDepth + fits.hairWarm * p.w.hairWarm +
      fits.contrast * p.w.contrast + fits.warmth * p.w.warmth +
      fits.chroma * p.w.chroma;
    scores.push({
      key, name: colorTypes[key]?.name || key, season: colorTypes[key]?.season || '',
      score: Math.round(score * 1000) / 1000,
      fits: {
        skinIta: Math.round(fits.skinIta * 100), skinHue: Math.round(fits.skinHue * 100),
        hairDepth: Math.round(fits.hairDepth * 100), hairWarm: Math.round(fits.hairWarm * 100),
        contrast: Math.round(fits.contrast * 100), warmth: Math.round(fits.warmth * 100),
        chroma: Math.round(fits.chroma * 100)
      }
    });
  }
  scores.sort((a, b) => b.score - a.score);
  const mx = scores[0].score;
  if (mx > 0) scores.forEach(s => { s.pct = Math.round((s.score / mx) * 100); });
  const confidence = scores.length >= 2 && mx > 0 ? Math.round(((scores[0].score - scores[1].score) / mx) * 100) : 100;
  return { scores, confidence };
}

function rangeScoreSmooth(value, min, max) {
  if (value >= min && value <= max) return 1.0;
  const halfRange = (max - min) / 2;
  const sigma = halfRange * 0.7;
  const dist = value < min ? min - value : value - max;
  return Math.exp(-(dist * dist) / (2 * sigma * sigma));
}

// ══════════════════════════════════════
// Feature-Berechnung (gemeinsame Pipeline, v5)
// ══════════════════════════════════════

/**
 * Berechnet Features + Matching aus rohen Lab-Werten.
 * v5: skinWarmth via a*+b*, Chroma im Matching, DeltaE2000 fuer Kontrast, Weissabgleich.
 */
function computeFeaturesAndMatch(skinLab, hairLab, irisLab, skinCluster, hairCluster, skinCount, hairCount, irisCount, wbOffset) {
  // Weissabgleich anwenden falls vorhanden
  const skinLabWb = applyWhiteBalance(skinLab, wbOffset);
  const hairLabWb = hairLab ? applyWhiteBalance(hairLab, wbOffset) : null;
  const irisLabWb = irisLab ? applyWhiteBalance(irisLab, wbOffset) : null;

  const skinIta = calculateITA(skinLabWb);
  const skinHue = calculateHueAngle(skinLabWb);
  const skinChroma = calculateChroma(skinLabWb);
  // v5: DeltaE2000 fuer Kontrast
  const skinHairContrast = hairLabWb ? deltaE2000(skinLabWb, hairLabWb) : 25;
  const skinIrisContrast = irisLabWb ? deltaE2000(skinLabWb, irisLabWb) : 20;
  const hw = hairWarmth(hairLabWb);
  const iw = irisWarmth(irisLabWb);
  // v5: skinWarmth beruecksichtigt a* und b*
  const sw = skinWarmthFromLab(skinLabWb);
  const overallWarmth = sw * 0.40 + hw * 0.35 + iw * 0.25;

  const features = {
    skinIta, skinHue, skinChroma, skinItaCategory: itaCategory(skinIta),
    hairDepth: hairLabWb ? hairLabWb.L : 50, hairWarmth: hw, irisWarmth: iw,
    skinHairContrast, skinIrisContrast, overallWarmth, skinWarmth: sw,
    whiteBalanceApplied: !!wbOffset
  };

  const { scores, confidence } = matchColorType(features);

  return {
    success: true,
    skin: { lab: skinLabWb, labRaw: skinLab, rgb: labToRgb(skinLabWb), cluster: skinCluster, pixelCount: skinCount },
    hair: { lab: hairLabWb, labRaw: hairLab, rgb: hairLabWb ? labToRgb(hairLabWb) : null, cluster: hairCluster, pixelCount: hairCount },
    iris: { lab: irisLabWb, labRaw: irisLab, rgb: irisLabWb ? labToRgb(irisLabWb) : null, pixelCount: irisCount },
    features, scores, topType: scores[0].key, topConfidence: confidence,
    whiteBalance: wbOffset ? { offset: wbOffset } : null
  };
}

// ══════════════════════════════════════
// Haupt-Analyse (Landmark-basiert)
// ══════════════════════════════════════

export async function analyzeSkin(imageEl) {
  if (!isInitialized) {
    try { await initSkinAnalysis(); } catch (err) {
      return { success: false, error: 'MediaPipe konnte nicht geladen werden: ' + err.message };
    }
  }

  const result = faceLandmarker.detect(imageEl);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return { success: false, error: 'Kein Gesicht erkannt.' };
  }

  const landmarks = result.faceLandmarks[0];
  const { pixels, W, H } = getImagePixels(imageEl);

  // v5: Sklera-Weissabgleich
  const scleraRgb = sampleScleraPixels(pixels, W, H, landmarks);
  const wbOffset = computeWhiteBalanceOffset(scleraRgb);
  if (wbOffset) {
    console.log('[skinAnalysis v5] Weissabgleich angewendet:', wbOffset, `(${scleraRgb.length} Sklera-Pixel)`);
  }

  const skinRgb = sampleSkinPixels(pixels, W, H, landmarks);
  if (skinRgb.length < 50) return { success: false, error: `Zu wenige Hautpixel (${skinRgb.length}).` };
  const skinLabs = skinRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const skinCluster = kMeansLab(skinLabs, 3);
  const skinLab = skinCluster.dominant;

  const hairRgb = sampleHairPixels(pixels, W, H, landmarks);
  const hairLabs = hairRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const hairCluster = hairRgb.length >= 20 ? kMeansLab(hairLabs, 2) : null;
  const hairLab = hairCluster ? hairCluster.dominant : (hairLabs.length > 0 ? averageLab(hairLabs) : null);

  const irisRgb = sampleIrisPixels(pixels, W, H, landmarks);
  const irisLabs = irisRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const irisLab = irisLabs.length >= 5 ? averageLab(irisLabs) : null;

  return computeFeaturesAndMatch(skinLab, hairLab, irisLab, skinCluster, hairCluster, skinRgb.length, hairRgb.length, irisRgb.length, wbOffset);
}

// ══════════════════════════════════════
// Region-basierte Analyse (v4, v5 Metriken)
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
  const hairRgbRaw = sampleRectPixels(pixels, W, H, regions.hair);
  const hairRgb = hairRgbRaw.filter(([r, g, b]) => {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 5 && lum < 240;
  });
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

  // v5: Sklera (cyan) — zur Visualisierung des Weissabgleichs
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
