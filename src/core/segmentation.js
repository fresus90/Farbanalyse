/**
 * Personen-Segmentierung über MediaPipe ImageSegmenter.
 *
 * Ersetzt das Flood-Fill-Freistellen als Hauptweg. Das Flood-Fill bleibt als
 * Rückfallebene erhalten, wenn das Modell nicht geladen werden kann.
 */

import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { WASM_PATH } from '../config/face.js';
import { SEGMENTER_OPTIONS, SEGMENTER_SOURCES } from '../config/segmentation.js';

let segmenter = null;
let initPromise = null;

async function loadModelBuffer(onStatus) {
  const errors = [];
  for (const url of SEGMENTER_SOURCES) {
    try {
      onStatus?.(url.startsWith('http') ? 'Freistell-Modell wird vom CDN geladen …' : 'Freistell-Modell wird geladen …');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.arrayBuffer();
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }
  throw new Error(`Segmentierungs-Modell nicht ladbar.\n${errors.join('\n')}`);
}

/** Initialisiert den Segmenter einmalig; parallele Aufrufe teilen sich das Promise. */
export function ensureSegmenter(onStatus) {
  if (segmenter) return Promise.resolve(segmenter);
  if (!initPromise) {
    initPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      const modelAssetBuffer = new Uint8Array(await loadModelBuffer(onStatus));
      segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer, delegate: 'GPU' },
        runningMode: 'IMAGE',
        ...SEGMENTER_OPTIONS
      });
      return segmenter;
    })().catch((err) => { initPromise = null; throw err; });
  }
  return initPromise;
}

export function isSegmenterReady() { return Boolean(segmenter); }

/**
 * Liefert eine Personen-Wahrscheinlichkeit je Maskenpixel (0..1).
 *
 * @param {CanvasImageSource} source
 * @returns {Promise<{data: Float32Array, width: number, height: number}>}
 */
export async function segmentPerson(source, onStatus) {
  const seg = await ensureSegmenter(onStatus);

  return new Promise((resolve, reject) => {
    try {
      // Die Masken sind nur innerhalb des Callbacks gültig — alles, was danach
      // gebraucht wird, muss hier kopiert werden.
      seg.segment(source, (result) => {
        try {
          const masks = result?.confidenceMasks;
          if (!masks?.length) { reject(new Error('Segmentierung lieferte keine Maske.')); return; }

          // Bei zwei Masken ist Index 1 die Person, bei einer Maske gibt es nur
          // einen Kanal. Welche Polarität das Modell liefert, wird unten geprüft
          // statt angenommen.
          const mask = masks.length > 1 ? masks[1] : masks[0];
          const width = mask.width, height = mask.height;
          const data = Float32Array.from(mask.getAsFloat32Array());

          orientPersonForeground(data, width, height);
          const problem = implausibleMask(data);
          if (problem) { reject(new Error(problem)); return; }

          resolve({ data, width, height });
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Prüft, ob die Maske überhaupt eine Person beschreibt.
 *
 * Erkennt das Modell niemanden, liefert es keine Fehlermeldung, sondern eine
 * Maske nahe null — daraus entstünde ein fast vollständig transparentes Bild.
 * Gemessen an einer Vektorzeichnung, die das Modell nicht als Foto erkennt:
 * Maximum 0.12, Mittelwert 0. Ohne diese Prüfung hätte die App dem Nutzer
 * wortlos ein leeres Ergebnis angezeigt, statt auf das Flood-Fill zurückzufallen.
 */
function implausibleMask(data) {
  let max = 0, personPixels = 0;
  for (const v of data) { if (v > max) max = v; if (v > 0.5) personPixels++; }
  const share = personPixels / data.length;

  if (max < 0.5) return 'Auf dem Bild wurde keine Person erkannt.';
  // Ein Porträt, das fast nichts oder fast alles abdeckt, ist keine brauchbare
  // Freistellung — dann ist das Flood-Fill die ehrlichere Antwort.
  if (share < 0.03) return `Erkannter Personenanteil zu klein (${(share * 100).toFixed(1)} %).`;
  if (share > 0.97) return `Erkannter Personenanteil zu groß (${(share * 100).toFixed(1)} %).`;
  return null;
}

/**
 * Stellt sicher, dass hohe Werte die Person meinen und nicht den Hintergrund.
 *
 * Statt die Kanalreihenfolge des Modells anzunehmen, wird sie gemessen: Bei
 * einem Porträt ist die Bildmitte Person und der Rand Hintergrund.
 *
 * Die Prüfung ist bewusst streng: Bei einem Selfie, das den Rahmen ausfüllt,
 * liegen Rand und Mitte beide hoch, und ein knapper Vorsprung des Randes würde
 * die Maske fälschlich umdrehen — das Ergebnis wäre, dass genau die Person
 * weggeschnitten wird. Umgedreht wird deshalb nur bei deutlichem Abstand.
 */
function orientPersonForeground(data, width, height) {
  let centerSum = 0, centerCount = 0, borderSum = 0, borderCount = 0;
  const x0 = Math.floor(width * 0.35), x1 = Math.ceil(width * 0.65);
  const y0 = Math.floor(height * 0.35), y1 = Math.ceil(height * 0.65);
  const margin = Math.max(1, Math.round(Math.min(width, height) * 0.04));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = data[y * width + x];
      if (x >= x0 && x < x1 && y >= y0 && y < y1) { centerSum += v; centerCount++; }
      else if (x < margin || x >= width - margin || y < margin || y >= height - margin) {
        borderSum += v; borderCount++;
      }
    }
  }

  const center = centerCount ? centerSum / centerCount : 0;
  const border = borderCount ? borderSum / borderCount : 0;
  if (border - center > 0.25) {
    for (let i = 0; i < data.length; i++) data[i] = 1 - data[i];
  }
  return data;
}

export async function disposeSegmenter() {
  if (!segmenter) return;
  try { segmenter.close(); } finally { segmenter = null; initPromise = null; }
}
