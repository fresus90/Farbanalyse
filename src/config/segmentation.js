/**
 * Konfiguration der Personen-Segmentierung (Freistellen).
 *
 * Läuft wie die Gesichtserkennung vollständig im Browser. Modell und Laufzeit
 * kommen aus dem eigenen Origin, damit der Service Worker sie cachen kann.
 *
 * Warum das kleine Modell: selfie_multiclass_256x256 liefert eine eigene
 * Haar-Klasse, wiegt aber 16 MB. Beide Modelle rechnen intern in 256x256 —
 * der Detailgrad an der Haarkante ist damit derselbe, der Unterschied ist rein
 * semantisch. Für das Freistellen einer Person reicht Person/Hintergrund, und
 * 250 KB statt 16 MB sind in einer installierbaren App kein Nebenaspekt.
 */

const BASE = import.meta.env?.BASE_URL ?? '/';

export const SEGMENTER_VARIANT = 'selfie_segmenter';

export const SEGMENTER_SOURCES = [
  `${BASE}models/${SEGMENTER_VARIANT}.tflite`,
  `https://storage.googleapis.com/mediapipe-models/image_segmenter/${SEGMENTER_VARIANT}/float16/latest/${SEGMENTER_VARIANT}.tflite`
];

export const SEGMENTER_OPTIONS = {
  outputCategoryMask: false,
  outputConfidenceMasks: true
};
