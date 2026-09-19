/**
 * Lädt die MediaPipe-Modelle einmalig nach public/models/.
 *
 * Selbst gehostet, damit zur Laufzeit keine Drittanbieter-Requests nötig sind
 * und der Service Worker sie same-origin cachen kann. Schlägt ein Download fehl
 * (z. B. Build ohne Netz), bricht der Build nicht ab — die App fällt dann zur
 * Laufzeit auf den CDN-Pfad zurück und ist in dem Fall nur online nutzbar.
 *
 * Die Dateien stehen in .gitignore.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
  },
  {
    file: 'selfie_segmenter.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
  }
];

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const targetDir = join(root, 'public', 'models');

await mkdir(targetDir, { recursive: true });

for (const { file, url } of MODELS) {
  const target = join(targetDir, file);
  try {
    const existing = await stat(target).catch(() => null);
    if (existing && existing.size > 0) {
      console.log(`[model] ${file} liegt bereits vor (${(existing.size / 1e6).toFixed(1)} MB).`);
      continue;
    }

    console.log(`[model] lade ${url} …`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    const { size } = await stat(target);
    console.log(`[model] gespeichert: public/models/${file} (${(size / 1e6).toFixed(1)} MB)`);
  } catch (error) {
    console.warn(`[model] ${file} übersprungen (${error.message}) – die App nutzt zur Laufzeit den CDN-Fallback.`);
  }
}
