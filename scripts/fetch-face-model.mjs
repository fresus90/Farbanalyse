/**
 * Lädt das Face-Landmarker-Modell einmalig nach public/models/.
 *
 * Selbst gehostet, damit zur Laufzeit keine Drittanbieter-Requests nötig sind
 * und der Service Worker das Modell same-origin cachen kann. Schlägt der
 * Download fehl (z. B. Build ohne Netz), bricht der Build nicht ab — die App
 * fällt dann zur Laufzeit auf den CDN-Pfad zurück (siehe src/config/face.js)
 * und ist in diesem Fall nur online nutzbar.
 *
 * Die Datei ist ~3,8 MB groß und steht in .gitignore.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VARIANT = 'face_landmarker';
const SOURCE_URL = `https://storage.googleapis.com/mediapipe-models/face_landmarker/${VARIANT}/float16/1/${VARIANT}.task`;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const targetDir = join(root, 'public', 'models');
const targetFile = join(targetDir, `${VARIANT}.task`);

try {
  const existing = await stat(targetFile).catch(() => null);
  if (existing && existing.size > 0) {
    console.log(`[model] ${VARIANT}.task liegt bereits vor (${(existing.size / 1e6).toFixed(1)} MB).`);
    process.exit(0);
  }

  console.log(`[model] lade ${SOURCE_URL} …`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  await mkdir(targetDir, { recursive: true });
  await writeFile(targetFile, Buffer.from(await response.arrayBuffer()));
  const { size } = await stat(targetFile);
  console.log(`[model] gespeichert: public/models/${VARIANT}.task (${(size / 1e6).toFixed(1)} MB)`);
} catch (error) {
  console.warn(`[model] Download übersprungen (${error.message}) – die App nutzt zur Laufzeit den CDN-Fallback.`);
  process.exit(0);
}
