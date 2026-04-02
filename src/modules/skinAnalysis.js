/**
 * skinAnalysis.js — Hautton-Extraktion & Farbtyp-Erkennung
 *
 * Pipeline:
 *   1. MediaPipe Face Landmarker → Gesicht lokalisieren
 *   2. Wangenregion-Sampling → Hautpixel extrahieren
 *   3. RGB → Lab Konvertierung (perceptuell uniform)
 *   4. K-Means Clustering → dominante Hauttöne
 *   5. Farbtyp-Matching → Scores für alle 12 Typen
 *
 * Exports:
 *   - initSkinAnalysis()     → MediaPipe laden
 *   - analyzeSkin(imageEl)   → { dominantLab, scores[], topType }
 */

import { $ } from '../state.js';
import colorTypes from '../data/colorTypes.json';

// ══════════════════════════════════════
// MediaPipe Face Landmarker
// ══════════════════════════════════════

let faceLandmarker = null;
let isInitialized = false;

/**
 * MediaPipe Face Landmarker laden (einmalig)
 */
export async function initSkinAnalysis() {
  if (isInitialized) return;

  // MediaPipe Vision Tasks via CDN laden
  // Nutzt @latest um Versionsprobleme zu vermeiden
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

// ══════════════════════════════════════
// Gesichtserkennung & Wangenregion
// ══════════════════════════════════════

/**
 * MediaPipe Face Landmark-Indizes für Wangenregionen
 * Linke Wange: Landmarks 50, 101, 118, 117, 116, 123, 147, 213
 * Rechte Wange: Landmarks 280, 330, 347, 346, 345, 352, 376, 433
 *
 * Diese Polygone liegen sicher auf der Wangenfläche,
 * fern von Augen, Mund, Nase und Kinn.
 */
const CHEEK_LEFT = [50, 101, 118, 117, 116, 123, 147, 213];
const CHEEK_RIGHT = [280, 330, 347, 346, 345, 352, 376, 433];

/**
 * Stirn-Region (obere Mitte) als zusätzliche Sampling-Zone
 * Landmarks zwischen Augenbrauen und Haaransatz
 */
const FOREHEAD = [10, 67, 69, 104, 108, 151, 337, 299, 297];

/**
 * Extrahiert Hautpixel aus den definierten Gesichtsregionen
 */
function sampleSkinPixels(imageEl, landmarks) {
  const canvas = document.createElement('canvas');
  const W = imageEl.naturalWidth || imageEl.width;
  const H = imageEl.naturalHeight || imageEl.height;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageEl, 0, 0, W, H);

  const imageData = ctx.getImageData(0, 0, W, H);
  const pixels = imageData.data;
  const skinPixels = [];

  // Alle drei Regionen sampeln
  const regions = [CHEEK_LEFT, CHEEK_RIGHT, FOREHEAD];

  for (const region of regions) {
    // Polygon-Punkte in Pixelkoordinaten
    const poly = region.map(i => ({
      x: Math.round(landmarks[i].x * W),
      y: Math.round(landmarks[i].y * H)
    }));

    // Bounding Box des Polygons
    const minX = Math.max(0, Math.min(...poly.map(p => p.x)) - 2);
    const maxX = Math.min(W - 1, Math.max(...poly.map(p => p.x)) + 2);
    const minY = Math.max(0, Math.min(...poly.map(p => p.y)) - 2);
    const maxY = Math.min(H - 1, Math.max(...poly.map(p => p.y)) + 2);

    // Pixel innerhalb des Polygons sampeln
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (pointInPolygon(x, y, poly)) {
          const idx = (y * W + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];

          // Grundfilter: offensichtlich kein Hautton ausschließen
          if (isSkinColorHeuristic(r, g, b)) {
            skinPixels.push([r, g, b]);
          }
        }
      }
    }
  }

  return skinPixels;
}

/**
 * Point-in-Polygon Test (Ray-Casting)
 */
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Heuristischer Hautfarb-Filter (YCbCr-basiert)
 * Filtert offensichtliche Nicht-Haut-Pixel aus
 */
function isSkinColorHeuristic(r, g, b) {
  // YCbCr-Konvertierung
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.169 * r - 0.331 * g + 0.500 * b;
  const cr = 128 + 0.500 * r - 0.419 * g - 0.081 * b;

  // Großzügige Hautfarb-Bereiche (deckt alle Hauttöne ab)
  return y > 40 && cb > 77 && cb < 127 && cr > 133 && cr < 173;
}

// ══════════════════════════════════════
// Farbraum-Konvertierungen
// ══════════════════════════════════════

/**
 * sRGB [0-255] → CIE Lab (D65)
 */
function rgbToLab(r, g, b) {
  // 1. sRGB → Linear RGB
  let rl = r / 255, gl = g / 255, bl = b / 255;
  rl = rl > 0.04045 ? Math.pow((rl + 0.055) / 1.055, 2.4) : rl / 12.92;
  gl = gl > 0.04045 ? Math.pow((gl + 0.055) / 1.055, 2.4) : gl / 12.92;
  bl = bl > 0.04045 ? Math.pow((bl + 0.055) / 1.055, 2.4) : bl / 12.92;

  // 2. Linear RGB → XYZ (D65)
  let x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  let y = (0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl) / 1.00000;
  let z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) / 1.08883;

  // 3. XYZ → Lab
  const epsilon = 0.008856;
  const kappa = 903.3;
  x = x > epsilon ? Math.cbrt(x) : (kappa * x + 16) / 116;
  y = y > epsilon ? Math.cbrt(y) : (kappa * y + 16) / 116;
  z = z > epsilon ? Math.cbrt(z) : (kappa * z + 16) / 116;

  return {
    L: 116 * y - 16,       // Helligkeit (0=schwarz, 100=weiß)
    a: 500 * (x - y),      // rot(+) ↔ grün(-)
    b: 200 * (y - z)       // gelb(+) ↔ blau(-)
  };
}

/**
 * Hex-Farbe → Lab
 */
function hexToLab(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return rgbToLab(r, g, b);
}

/**
 * Delta E (CIEDE2000) — perceptuell genaue Farbdistanz
 * Vereinfachte Version (CIE76 für Performance, CIEDE2000 als Option)
 */
function deltaE76(lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ══════════════════════════════════════
// K-Means Clustering
// ══════════════════════════════════════

/**
 * Einfaches K-Means auf Lab-Werte, gibt dominanten Cluster zurück
 */
function kMeansLab(labPixels, k = 3, maxIter = 20) {
  if (labPixels.length === 0) return null;
  if (labPixels.length < k) k = labPixels.length;

  // Initialisierung: k zufällige Zentren
  const centers = [];
  const step = Math.floor(labPixels.length / k);
  for (let i = 0; i < k; i++) {
    const p = labPixels[Math.min(i * step, labPixels.length - 1)];
    centers.push({ L: p.L, a: p.a, b: p.b });
  }

  let assignments = new Array(labPixels.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Zuweisen
    let changed = false;
    for (let i = 0; i < labPixels.length; i++) {
      let minDist = Infinity, minIdx = 0;
      for (let j = 0; j < k; j++) {
        const d = deltaE76(labPixels[i], centers[j]);
        if (d < minDist) { minDist = d; minIdx = j; }
      }
      if (assignments[i] !== minIdx) { assignments[i] = minIdx; changed = true; }
    }

    if (!changed) break;

    // Zentren aktualisieren
    for (let j = 0; j < k; j++) {
      let sumL = 0, sumA = 0, sumB = 0, count = 0;
      for (let i = 0; i < labPixels.length; i++) {
        if (assignments[i] === j) {
          sumL += labPixels[i].L;
          sumA += labPixels[i].a;
          sumB += labPixels[i].b;
          count++;
        }
      }
      if (count > 0) {
        centers[j] = { L: sumL / count, a: sumA / count, b: sumB / count };
      }
    }
  }

  // Größten Cluster finden (= dominanter Hautton)
  const clusterSizes = new Array(k).fill(0);
  for (const a of assignments) clusterSizes[a]++;
  const dominantIdx = clusterSizes.indexOf(Math.max(...clusterSizes));

  return {
    dominant: centers[dominantIdx],
    all: centers.map((c, i) => ({ ...c, size: clusterSizes[i] })),
    totalPixels: labPixels.length
  };
}

// ══════════════════════════════════════
// Abgeleitete Metriken (ITA, Hue Angle)
// ══════════════════════════════════════

/**
 * Individual Typology Angle (ITA)
 * Wissenschaftliche Hautton-Klassifikation nach Chardon et al.
 * Berechnet aus L* und b*, klassifiziert in 6 Kategorien.
 *
 * ITA-Kategorien:
 *   > 55°  → Very Light
 *   41–55° → Light
 *   28–41° → Intermediate
 *   10–28° → Tan
 *  -30–10° → Brown
 *   < -30° → Dark
 */
function calculateITA(lab) {
  return Math.atan2(lab.L - 50, lab.b) * (180 / Math.PI);
}

function itaCategory(ita) {
  if (ita > 55) return 'very_light';
  if (ita > 41) return 'light';
  if (ita > 28) return 'intermediate';
  if (ita > 10) return 'tan';
  if (ita > -30) return 'brown';
  return 'dark';
}

/**
 * Hue Angle (h*)
 * Farbtonwinkel aus a* und b* — erfasst warm/kalt unabhängig von Helligkeit.
 * Hauttöne liegen typisch zwischen 30° (rötlich) und 80° (gelblich).
 *   < 50° → kühl-rosig (Sommer/Winter)
 *   50–65° → neutral
 *   > 65° → warm-golden (Frühling/Herbst)
 */
function calculateHueAngle(lab) {
  let h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return h;
}

/**
 * Chroma (C*) — Sättigung/Klarheit des Hauttons
 * Hoher Chroma = klarer, lebendiger Hautton (Bright/Clear Subtypen)
 * Niedriger Chroma = gedämpfter, weicher Hautton (Soft Subtypen)
 */
function calculateChroma(lab) {
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b);
}

// ══════════════════════════════════════
// Farbtyp-Matching (3-Achsen-Modell)
// ══════════════════════════════════════

/**
 * Typ-Profile basierend auf dem 3-Achsen-Modell:
 *   1. Temperatur (warm ↔ kalt) — primär über Hue Angle + b*
 *   2. Wertigkeit/Tiefe (hell ↔ dunkel) — primär über ITA + L*
 *   3. Klarheit (klar ↔ gedämpft) — primär über Chroma
 *
 * Jedes Profil definiert erwartete Ranges für:
 *   - ita: [min, max] Individual Typology Angle
 *   - hue: [min, max] Hue Angle (Grad)
 *   - chroma: [min, max] Farbsättigung
 *   - tempWeight: wie stark Warm/Kalt-Achse diesen Typ definiert (0–1)
 *   - depthWeight: wie stark Hell/Dunkel-Achse relevant ist (0–1)
 *   - clarityWeight: wie stark Klar/Gedämpft-Achse relevant ist (0–1)
 */
const TYPE_PROFILES = {
  // ── Frühling (warm) ──
  spring_light: {
    ita: [42, 75],    hue: [55, 80],   chroma: [14, 26],
    tempWeight: 0.30, depthWeight: 0.40, clarityWeight: 0.30,
    desc: 'Sehr hell, warm, mittlere Klarheit'
  },
  spring_warm: {
    ita: [25, 60],    hue: [60, 85],   chroma: [18, 32],
    tempWeight: 0.45, depthWeight: 0.25, clarityWeight: 0.30,
    desc: 'Golden, warm, leuchtend'
  },
  spring_clear: {
    ita: [30, 65],    hue: [50, 75],   chroma: [20, 36],
    tempWeight: 0.30, depthWeight: 0.25, clarityWeight: 0.45,
    desc: 'Warm, hoher Kontrast, klare Farben'
  },

  // ── Sommer (kühl) ──
  summer_light: {
    ita: [45, 80],    hue: [30, 55],   chroma: [8, 20],
    tempWeight: 0.30, depthWeight: 0.40, clarityWeight: 0.30,
    desc: 'Sehr hell, kühl, zart'
  },
  summer_cool: {
    ita: [30, 65],    hue: [28, 52],   chroma: [10, 22],
    tempWeight: 0.45, depthWeight: 0.25, clarityWeight: 0.30,
    desc: 'Rosig-kühl, mittlere Tiefe'
  },
  summer_soft: {
    ita: [22, 55],    hue: [35, 60],   chroma: [8, 18],
    tempWeight: 0.30, depthWeight: 0.25, clarityWeight: 0.45,
    desc: 'Kühl, gedämpft, weich'
  },

  // ── Herbst (warm) ──
  autumn_soft: {
    ita: [18, 48],    hue: [55, 78],   chroma: [10, 22],
    tempWeight: 0.30, depthWeight: 0.25, clarityWeight: 0.45,
    desc: 'Warm-neutral, gedämpft, weich'
  },
  autumn_warm: {
    ita: [5, 38],     hue: [60, 85],   chroma: [16, 30],
    tempWeight: 0.45, depthWeight: 0.30, clarityWeight: 0.25,
    desc: 'Golden-warm, mittlere bis dunkle Tiefe'
  },
  autumn_deep: {
    ita: [-30, 20],   hue: [55, 80],   chroma: [14, 28],
    tempWeight: 0.25, depthWeight: 0.45, clarityWeight: 0.30,
    desc: 'Dunkel, warm, intensiv'
  },

  // ── Winter (kühl) ──
  winter_cool: {
    ita: [35, 70],    hue: [25, 50],   chroma: [12, 24],
    tempWeight: 0.45, depthWeight: 0.25, clarityWeight: 0.30,
    desc: 'Kühl, hell bis mittel, klar'
  },
  winter_deep: {
    ita: [-35, 18],   hue: [28, 55],   chroma: [12, 26],
    tempWeight: 0.25, depthWeight: 0.45, clarityWeight: 0.30,
    desc: 'Dunkel, kühl, kontrastreich'
  },
  winter_clear: {
    ita: [25, 60],    hue: [25, 50],   chroma: [18, 34],
    tempWeight: 0.25, depthWeight: 0.25, clarityWeight: 0.50,
    desc: 'Kühl, hoher Kontrast, klare Ausstrahlung'
  }
};

/**
 * Berechnet Matching-Score für jeden Farbtyp
 *
 * Methodik:
 *   1. ITA, Hue Angle und Chroma aus dominantem Hautton berechnen
 *   2. Pro Typ: Range-Fit für jede Achse bestimmen
 *   3. Gewichteter Score nach Typ-spezifischer Achsen-Dominanz
 *   4. Sortierung + Confidence-Berechnung
 *
 * @param {Object} skinLab - { L, a, b } dominanter Hautton
 * @returns {Array} Sortierte Scores [{ key, name, score, confidence, metrics }]
 */
function matchColorType(skinLab) {
  // Abgeleitete Metriken berechnen
  const ita = calculateITA(skinLab);
  const hue = calculateHueAngle(skinLab);
  const chroma = calculateChroma(skinLab);
  const itaCat = itaCategory(ita);

  const metrics = { ita, itaCategory: itaCat, hue, chroma, L: skinLab.L, a: skinLab.a, b: skinLab.b };

  const scores = [];

  for (const [key, profile] of Object.entries(TYPE_PROFILES)) {
    // Range-Fits berechnen (wie gut passt der Messwert in den erwarteten Bereich?)
    const itaFit = rangeScoreSmooth(ita, profile.ita[0], profile.ita[1]);
    const hueFit = rangeScoreSmooth(hue, profile.hue[0], profile.hue[1]);
    const chromaFit = rangeScoreSmooth(chroma, profile.chroma[0], profile.chroma[1]);

    // Gewichteter Score nach Typ-Dominanz
    // tempWeight steuert, wie stark der Hue-Fit zählt (warm/kalt)
    // depthWeight steuert, wie stark der ITA-Fit zählt (hell/dunkel)
    // clarityWeight steuert, wie stark der Chroma-Fit zählt (klar/gedämpft)
    const score =
      itaFit * profile.depthWeight +
      hueFit * profile.tempWeight +
      chromaFit * profile.clarityWeight;

    scores.push({
      key,
      name: colorTypes[key]?.name || key,
      season: colorTypes[key]?.season || '',
      score: Math.round(score * 1000) / 1000,
      fits: {
        ita: Math.round(itaFit * 100),
        hue: Math.round(hueFit * 100),
        chroma: Math.round(chromaFit * 100)
      }
    });
  }

  // Sortieren nach Score
  scores.sort((a, b) => b.score - a.score);

  // Normalisierung: bester Score = 100%
  const maxScore = scores[0].score;
  if (maxScore > 0) {
    scores.forEach(s => {
      s.pct = Math.round((s.score / maxScore) * 100);
    });
  }

  // Confidence = prozentualer Abstand zwischen #1 und #2
  const confidence = scores.length >= 2 && maxScore > 0
    ? Math.round(((scores[0].score - scores[1].score) / maxScore) * 100)
    : 100;

  return { scores, metrics, confidence };
}

/**
 * Smooth Range-Score: 1.0 innerhalb des Range, weicher Abfall außerhalb.
 * Verwendet Gauss-ähnlichen Falloff statt linearem Abfall.
 */
function rangeScoreSmooth(value, min, max) {
  if (value >= min && value <= max) return 1.0;
  const halfRange = (max - min) / 2;
  const sigma = halfRange * 0.8; // Falloff-Breite
  const dist = value < min ? min - value : value - max;
  return Math.exp(-(dist * dist) / (2 * sigma * sigma));
}

// ══════════════════════════════════════
// Haupt-Analyse-Funktion
// ══════════════════════════════════════

/**
 * Führt die komplette Hautton-Analyse durch
 *
 * @param {HTMLImageElement} imageEl - Das zu analysierende Bild
 * @returns {Object} Analyse-Ergebnis:
 *   - success: boolean
 *   - dominantLab: { L, a, b }
 *   - dominantRgb: { r, g, b }
 *   - scores: [{ key, name, score, confidence, rank }]
 *   - topType: string (key des besten Typs)
 *   - clusterInfo: { dominant, all, totalPixels }
 *   - error: string (falls !success)
 */
export async function analyzeSkin(imageEl) {
  // MediaPipe laden falls noch nicht geschehen
  if (!isInitialized) {
    try {
      await initSkinAnalysis();
    } catch (err) {
      return {
        success: false,
        error: 'MediaPipe konnte nicht geladen werden: ' + err.message
      };
    }
  }

  // 1. Gesicht erkennen
  const result = faceLandmarker.detect(imageEl);

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return {
      success: false,
      error: 'Kein Gesicht erkannt. Bitte ein Foto mit deutlich sichtbarem Gesicht verwenden.'
    };
  }

  const landmarks = result.faceLandmarks[0];

  // 2. Hautpixel sampeln
  const skinPixels = sampleSkinPixels(imageEl, landmarks);

  if (skinPixels.length < 50) {
    return {
      success: false,
      error: `Zu wenige Hautpixel erkannt (${skinPixels.length}). Bitte ein Foto mit besserem Licht verwenden.`
    };
  }

  // 3. RGB → Lab konvertieren
  const labPixels = skinPixels.map(([r, g, b]) => rgbToLab(r, g, b));

  // 4. K-Means Clustering
  const clusterInfo = kMeansLab(labPixels, 3);

  if (!clusterInfo || !clusterInfo.dominant) {
    return {
      success: false,
      error: 'Farbanalyse fehlgeschlagen. Bitte ein anderes Foto versuchen.'
    };
  }

  // 5. Farbtyp-Matching
  const { scores, metrics, confidence } = matchColorType(clusterInfo.dominant);

  // Dominanten Lab-Wert zurück in RGB konvertieren (für Anzeige)
  const dominantRgb = labToRgbApprox(clusterInfo.dominant);

  return {
    success: true,
    dominantLab: clusterInfo.dominant,
    dominantRgb,
    metrics,              // ITA, Hue Angle, Chroma, ITA-Kategorie
    scores,               // Alle 12 Typen mit Score + Fits
    topType: scores[0].key,
    topConfidence: confidence,
    clusterInfo,
    pixelCount: skinPixels.length
  };
}

/**
 * Grobe Lab → RGB Rückkonvertierung (nur für Anzeige)
 */
function labToRgbApprox(lab) {
  // Lab → XYZ
  let y = (lab.L + 16) / 116;
  let x = lab.a / 500 + y;
  let z = y - lab.b / 200;

  const epsilon = 0.008856;
  const kappa = 903.3;

  x = (x * x * x > epsilon) ? x * x * x : (116 * x - 16) / kappa;
  y = (y * y * y > epsilon) ? y * y * y : (116 * y - 16) / kappa;
  z = (z * z * z > epsilon) ? z * z * z : (116 * z - 16) / kappa;

  x *= 0.95047;
  z *= 1.08883;

  // XYZ → Linear RGB
  let r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  let g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  let b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  // Linear → sRGB
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b;

  return {
    r: Math.round(Math.max(0, Math.min(255, r * 255))),
    g: Math.round(Math.max(0, Math.min(255, g * 255))),
    b: Math.round(Math.max(0, Math.min(255, b * 255)))
  };
}

/**
 * Quick-Check: Ist MediaPipe geladen?
 */
export function isAnalysisReady() {
  return isInitialized;
}

/**
 * Debug: Zeichnet die Sampling-Regionen auf ein Canvas
 * (für Entwicklung / Qualitätskontrolle)
 */
export function debugDrawRegions(imageEl, targetCanvas) {
  if (!faceLandmarker) return null;

  const result = faceLandmarker.detect(imageEl);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

  const landmarks = result.faceLandmarks[0];
  const W = imageEl.naturalWidth || imageEl.width;
  const H = imageEl.naturalHeight || imageEl.height;

  targetCanvas.width = W;
  targetCanvas.height = H;
  const ctx = targetCanvas.getContext('2d');
  ctx.drawImage(imageEl, 0, 0, W, H);

  // Regionen zeichnen
  const regions = [
    { points: CHEEK_LEFT, color: 'rgba(74, 127, 165, 0.4)', label: 'L. Wange' },
    { points: CHEEK_RIGHT, color: 'rgba(74, 127, 165, 0.4)', label: 'R. Wange' },
    { points: FOREHEAD, color: 'rgba(165, 127, 74, 0.4)', label: 'Stirn' }
  ];

  for (const region of regions) {
    ctx.beginPath();
    const firstPt = landmarks[region.points[0]];
    ctx.moveTo(firstPt.x * W, firstPt.y * H);
    for (let i = 1; i < region.points.length; i++) {
      const pt = landmarks[region.points[i]];
      ctx.lineTo(pt.x * W, pt.y * H);
    }
    ctx.closePath();
    ctx.fillStyle = region.color;
    ctx.fill();
    ctx.strokeStyle = region.color.replace('0.4', '0.8');
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  return result;
}
