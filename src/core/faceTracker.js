/**
 * Face Landmarker im VIDEO-Modus für die Live-Kamerahilfe.
 *
 * Bewusst eine eigene Instanz statt setOptions() auf der Analyse-Instanz: Der
 * Laufmodus ist Zustand, und ein Moduswechsel mitten in einer laufenden Analyse
 * wäre ein Fehler, der nur gelegentlich auftritt. Das Modell selbst teilen sich
 * beide (siehe faceModel.js), es wird nur einmal geladen.
 */

import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { loadFaceModelBuffer, loadVision } from './faceModel.js';

let tracker = null;
let initPromise = null;

export function ensureFaceTracker() {
  if (tracker) return Promise.resolve(tracker);
  if (!initPromise) {
    initPromise = (async () => {
      const vision = await loadVision();
      const modelAssetBuffer = new Uint8Array(await loadFaceModelBuffer());
      tracker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });
      return tracker;
    })().catch((err) => { initPromise = null; throw err; });
  }
  return initPromise;
}

/** @returns {Array|null} Landmarks des ersten Gesichts oder null */
export function detectInVideo(source, timestampMs) {
  if (!tracker) return null;
  const res = tracker.detectForVideo(source, timestampMs);
  return res?.faceLandmarks?.[0] ?? null;
}

export function disposeFaceTracker() {
  if (!tracker) return;
  try { tracker.close(); } finally { tracker = null; initPromise = null; }
}
