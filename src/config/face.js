/**
 * Konfiguration der Gesichts-Erkennung.
 *
 * Die Analyse läuft vollständig im Browser (MediaPipe Tasks Vision, WASM).
 * Das Foto verlässt das Gerät nicht — es gibt keinen Server-Endpunkt.
 */

const BASE = import.meta.env?.BASE_URL ?? '/';

/** Verzeichnis mit der WASM-Laufzeit (siehe scripts/sync-mediapipe-assets.mjs). */
export const WASM_PATH = `${BASE}mediapipe/wasm`;

export const MODEL_VARIANT = 'face_landmarker';

/**
 * Modell-Quellen in Prioritätsreihenfolge.
 * Zuerst die selbst gehostete Datei (offline-fähig, keine Drittanbieter-
 * Requests), danach der Google-CDN als Fallback — falls `npm run assets:model`
 * nicht lief. Mit CDN-Fallback funktioniert die Analyse nur online.
 */
export const MODEL_SOURCES = [
  `${BASE}models/${MODEL_VARIANT}.task`,
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/${MODEL_VARIANT}/float16/1/${MODEL_VARIANT}.task`
];

/** Optionen des Face Landmarkers. Ein Gesicht pro Bild genügt. */
export const LANDMARKER_OPTIONS = {
  numFaces: 1,
  outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: false
};
