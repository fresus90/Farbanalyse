/**
 * Gemeinsame Ladelogik für das Gesichts-Modell.
 *
 * Die Analyse nutzt den Landmarker im IMAGE-Modus, die Live-Kamerahilfe im
 * VIDEO-Modus. Das sind zwei Instanzen, aber dieselbe 3,8-MB-Datei — sie wird
 * einmal geladen und danach aus dem Cache gereicht.
 */

import { FilesetResolver } from '@mediapipe/tasks-vision';
import { MODEL_SOURCES, WASM_PATH } from '../config/face.js';

let bufferPromise = null;
let visionPromise = null;

/** Die WASM-Laufzeit; alle Tasks teilen sich dieselbe. */
export function loadVision() {
  if (!visionPromise) {
    visionPromise = FilesetResolver.forVisionTasks(WASM_PATH)
      .catch((err) => { visionPromise = null; throw err; });
  }
  return visionPromise;
}

/** Modell als ArrayBuffer — erste erreichbare Quelle gewinnt, danach gecacht. */
export function loadFaceModelBuffer(onStatus) {
  if (!bufferPromise) {
    bufferPromise = (async () => {
      const errors = [];
      for (const url of MODEL_SOURCES) {
        try {
          onStatus?.(url.startsWith('http') ? 'Modell wird vom CDN geladen …' : 'Modell wird geladen …');
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.arrayBuffer();
        } catch (err) {
          errors.push(`${url}: ${err.message}`);
        }
      }
      throw new Error(`Gesichts-Modell nicht ladbar.\n${errors.join('\n')}`);
    })().catch((err) => { bufferPromise = null; throw err; });
  }
  return bufferPromise;
}
