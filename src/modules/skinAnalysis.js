/**
 * skinAnalysis.js — Vollständige Erscheinungsbild-Analyse
 *
 * Pipeline:
 *   1. MediaPipe Face Landmarker → Gesicht + 478 Landmarks
 *   2. Drei Regionen sampeln: Haut (Wangen), Haar (Haaransatz), Iris
 *   3. RGB → Lab Konvertierung je Region
 *   4. K-Means Clustering → dominante Farbe je Region
 *   5. Abgeleitete Metriken: ITA, Hue Angle, Kontrast Haut↔Haar↔Iris
 *   6. 6-Dimensionales Farbtyp-Matching mit typ-spezifischen Gewichten
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

function deltaE76(lab1, lab2) {
  const dL = lab1.L - lab2.L, da = lab1.a - lab2.a, db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
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
// Metriken
// ══════════════════════════════════════

function calculateITA(lab) { return Math.atan2(lab.L - 50, lab.b) * (180 / Math.PI); }
function itaCategory(ita) {
  if (ita > 55) return 'very_light'; if (ita > 41) return 'light'; if (ita > 28) return 'intermediate';
  if (ita > 10) return 'tan'; if (ita > -30) return 'brown'; return 'dark';
}
function calculateHueAngle(lab) { let h = Math.atan2(lab.b, lab.a) * (180 / Math.PI); return h < 0 ? h + 360 : h; }
function calculateChroma(lab) { return Math.sqrt(lab.a * lab.a + lab.b * lab.b); }

function hairWarmth(hairLab) {
  if (!hairLab) return 0.5;
  return Math.max(0, Math.min(1, (hairLab.b - 5) / 25));
}
function irisWarmth(irisLab) {
  if (!irisLab) return 0.5;
  return Math.max(0, Math.min(1, ((irisLab.a + 5) / 25 + (irisLab.b + 5) / 30) / 2));
}

// ══════════════════════════════════════
// 6-Dimensionales Farbtyp-Matching
// ══════════════════════════════════════

const TYPE_PROFILES = {
  spring_light: {
    skinIta: [40, 78], skinHue: [50, 80], hairDepth: [55, 85], hairWarm: [0.50, 1.0], contrast: [10, 35], warmth: [0.55, 0.85],
    w: { skinIta: 0.15, skinHue: 0.15, hairDepth: 0.15, hairWarm: 0.20, contrast: 0.15, warmth: 0.20 }
  },
  spring_warm: {
    skinIta: [20, 62], skinHue: [55, 85], hairDepth: [35, 70], hairWarm: [0.60, 1.0], contrast: [15, 40], warmth: [0.65, 1.0],
    w: { skinIta: 0.10, skinHue: 0.15, hairDepth: 0.10, hairWarm: 0.25, contrast: 0.10, warmth: 0.30 }
  },
  spring_clear: {
    skinIta: [28, 68], skinHue: [45, 75], hairDepth: [20, 65], hairWarm: [0.40, 0.85], contrast: [35, 70], warmth: [0.50, 0.80],
    w: { skinIta: 0.10, skinHue: 0.15, hairDepth: 0.10, hairWarm: 0.15, contrast: 0.30, warmth: 0.20 }
  },
  summer_light: {
    skinIta: [42, 80], skinHue: [30, 58], hairDepth: [50, 82], hairWarm: [0.10, 0.45], contrast: [8, 30], warmth: [0.15, 0.42],
    w: { skinIta: 0.18, skinHue: 0.15, hairDepth: 0.18, hairWarm: 0.18, contrast: 0.13, warmth: 0.18 }
  },
  summer_cool: {
    skinIta: [28, 68], skinHue: [25, 55], hairDepth: [30, 65], hairWarm: [0.05, 0.40], contrast: [15, 40], warmth: [0.10, 0.38],
    w: { skinIta: 0.12, skinHue: 0.20, hairDepth: 0.10, hairWarm: 0.20, contrast: 0.10, warmth: 0.28 }
  },
  summer_soft: {
    skinIta: [22, 60], skinHue: [32, 62], hairDepth: [30, 60], hairWarm: [0.15, 0.50], contrast: [8, 28], warmth: [0.20, 0.48],
    w: { skinIta: 0.10, skinHue: 0.15, hairDepth: 0.10, hairWarm: 0.18, contrast: 0.27, warmth: 0.20 }
  },
  autumn_soft: {
    skinIta: [18, 52], skinHue: [48, 78], hairDepth: [28, 58], hairWarm: [0.35, 0.70], contrast: [8, 28], warmth: [0.42, 0.68],
    w: { skinIta: 0.10, skinHue: 0.15, hairDepth: 0.10, hairWarm: 0.18, contrast: 0.27, warmth: 0.20 }
  },
  autumn_warm: {
    skinIta: [5, 42], skinHue: [55, 85], hairDepth: [18, 50], hairWarm: [0.55, 1.0], contrast: [15, 42], warmth: [0.60, 1.0],
    w: { skinIta: 0.10, skinHue: 0.15, hairDepth: 0.10, hairWarm: 0.25, contrast: 0.10, warmth: 0.30 }
  },
  autumn_deep: {
    skinIta: [-30, 25], skinHue: [50, 80], hairDepth: [8, 35], hairWarm: [0.35, 0.80], contrast: [10, 35], warmth: [0.45, 0.78],
    w: { skinIta: 0.20, skinHue: 0.15, hairDepth: 0.20, hairWarm: 0.15, contrast: 0.10, warmth: 0.20 }
  },
  winter_cool: {
    skinIta: [32, 72], skinHue: [22, 52], hairDepth: [25, 60], hairWarm: [0.00, 0.35], contrast: [25, 55], warmth: [0.05, 0.32],
    w: { skinIta: 0.12, skinHue: 0.18, hairDepth: 0.10, hairWarm: 0.18, contrast: 0.15, warmth: 0.27 }
  },
  winter_deep: {
    skinIta: [-35, 22], skinHue: [25, 58], hairDepth: [5, 30], hairWarm: [0.05, 0.40], contrast: [30, 70], warmth: [0.10, 0.38],
    w: { skinIta: 0.18, skinHue: 0.12, hairDepth: 0.20, hairWarm: 0.12, contrast: 0.23, warmth: 0.15 }
  },
  winter_clear: {
    skinIta: [22, 65], skinHue: [22, 52], hairDepth: [8, 40], hairWarm: [0.00, 0.30], contrast: [38, 75], warmth: [0.05, 0.30],
    w: { skinIta: 0.08, skinHue: 0.15, hairDepth: 0.10, hairWarm: 0.15, contrast: 0.32, warmth: 0.20 }
  }
};

function matchColorType(features) {
  const { skinIta, skinHue, hairDepth, hairWarmth: hw, skinHairContrast, overallWarmth } = features;
  const scores = [];
  for (const [key, p] of Object.entries(TYPE_PROFILES)) {
    const fits = {
      skinIta: rangeScoreSmooth(skinIta, p.skinIta[0], p.skinIta[1]),
      skinHue: rangeScoreSmooth(skinHue, p.skinHue[0], p.skinHue[1]),
      hairDepth: rangeScoreSmooth(hairDepth, p.hairDepth[0], p.hairDepth[1]),
      hairWarm: rangeScoreSmooth(hw, p.hairWarm[0], p.hairWarm[1]),
      contrast: rangeScoreSmooth(skinHairContrast, p.contrast[0], p.contrast[1]),
      warmth: rangeScoreSmooth(overallWarmth, p.warmth[0], p.warmth[1])
    };
    const score = fits.skinIta * p.w.skinIta + fits.skinHue * p.w.skinHue +
      fits.hairDepth * p.w.hairDepth + fits.hairWarm * p.w.hairWarm +
      fits.contrast * p.w.contrast + fits.warmth * p.w.warmth;
    scores.push({
      key, name: colorTypes[key]?.name || key, season: colorTypes[key]?.season || '',
      score: Math.round(score * 1000) / 1000,
      fits: { skinIta: Math.round(fits.skinIta * 100), skinHue: Math.round(fits.skinHue * 100),
        hairDepth: Math.round(fits.hairDepth * 100), hairWarm: Math.round(fits.hairWarm * 100),
        contrast: Math.round(fits.contrast * 100), warmth: Math.round(fits.warmth * 100) }
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
// Haupt-Analyse
// ══════════════════════════════════════

export async function analyzeSkin(imageEl) {
  if (!isInitialized) {
    try { await initSkinAnalysis(); } catch (err) {
      return { success: false, error: 'MediaPipe konnte nicht geladen werden: ' + err.message };
    }
  }

  const result = faceLandmarker.detect(imageEl);
  console.log('[skinAnalysis v2] Face detected:', !!result.faceLandmarks?.length, 'landmarks:', result.faceLandmarks?.[0]?.length);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return { success: false, error: 'Kein Gesicht erkannt.' };
  }

  const landmarks = result.faceLandmarks[0];
  const { pixels, W, H } = getImagePixels(imageEl);

  // 1. Haut
  const skinRgb = sampleSkinPixels(pixels, W, H, landmarks);
  if (skinRgb.length < 50) return { success: false, error: `Zu wenige Hautpixel (${skinRgb.length}).` };
  const skinLabs = skinRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const skinCluster = kMeansLab(skinLabs, 3);
  const skinLab = skinCluster.dominant;

  // 2. Haar
  const hairRgb = sampleHairPixels(pixels, W, H, landmarks);
  const hairLabs = hairRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const hairCluster = hairRgb.length >= 20 ? kMeansLab(hairLabs, 2) : null;
  const hairLab = hairCluster ? hairCluster.dominant : (hairLabs.length > 0 ? averageLab(hairLabs) : null);

  // 3. Iris
  const irisRgb = sampleIrisPixels(pixels, W, H, landmarks);
  const irisLabs = irisRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const irisLab = irisLabs.length >= 5 ? averageLab(irisLabs) : null;

  // 4. Features
  const skinIta = calculateITA(skinLab);
  const skinHue = calculateHueAngle(skinLab);
  const skinChroma = calculateChroma(skinLab);
  const skinHairContrast = hairLab ? deltaE76(skinLab, hairLab) : 25;
  const skinIrisContrast = irisLab ? deltaE76(skinLab, irisLab) : 20;
  const hw = hairWarmth(hairLab);
  const iw = irisWarmth(irisLab);
  const skinWarmth = Math.max(0, Math.min(1, (skinHue - 25) / 55));
  const overallWarmth = skinWarmth * 0.40 + hw * 0.35 + iw * 0.25;

  const features = {
    skinIta, skinHue, skinChroma, skinItaCategory: itaCategory(skinIta),
    hairDepth: hairLab ? hairLab.L : 50, hairWarmth: hw, irisWarmth: iw,
    skinHairContrast, skinIrisContrast, overallWarmth, skinWarmth
  };

  // 5. Matching
  const { scores, confidence } = matchColorType(features);

  return {
    success: true,
    skin: { lab: skinLab, rgb: labToRgb(skinLab), cluster: skinCluster, pixelCount: skinRgb.length },
    hair: { lab: hairLab, rgb: hairLab ? labToRgb(hairLab) : null, cluster: hairCluster, pixelCount: hairRgb.length },
    iris: { lab: irisLab, rgb: irisLab ? labToRgb(irisLab) : null, pixelCount: irisRgb.length },
    features, scores, topType: scores[0].key, topConfidence: confidence
  };
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

  // Iris (grün)
  if (landmarks.length >= 478) {
    for (const ci of [IRIS_LEFT_CENTER, IRIS_RIGHT_CENTER]) {
      ctx.beginPath(); ctx.arc(landmarks[ci].x * W, landmarks[ci].y * H, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(100, 180, 100, 0.35)'; ctx.fill();
      ctx.strokeStyle = 'rgba(100, 180, 100, 0.7)'; ctx.lineWidth = 2; ctx.stroke();
    }
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
