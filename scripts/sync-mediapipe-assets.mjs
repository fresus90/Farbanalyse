/**
 * Kopiert die MediaPipe-WASM-Laufzeit aus node_modules nach public/mediapipe/wasm.
 *
 * Warum selbst hosten statt CDN:
 *   - Offline-Fähigkeit: Ein Service Worker kann nur same-origin zuverlässig cachen.
 *   - Keine Drittanbieter-Requests zur Laufzeit — die Analyse läuft ohnehin
 *     vollständig auf dem Gerät, das Foto verlässt es nie.
 *   - Reproduzierbare Builds: Die Version ist über package.json gepinnt, nicht
 *     über ein "@latest" in einer URL.
 *
 * Die Dateien sind ~22 MB und stehen daher in .gitignore — sie werden bei
 * `npm install` und vor jedem Build aus node_modules neu erzeugt.
 */

import { cp, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const target = join(root, 'public', 'mediapipe', 'wasm');

// Nur die SIMD- und die noSIMD-Variante; die "module"-Variante braucht der
// FilesetResolver im Browser-Bundle nicht.
const FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm'
];

try {
  await access(source);
} catch {
  console.warn('[mediapipe] node_modules/@mediapipe/tasks-vision/wasm nicht gefunden – übersprungen.');
  process.exit(0);
}

await mkdir(target, { recursive: true });
for (const file of FILES) {
  await cp(join(source, file), join(target, file));
}
console.log(`[mediapipe] ${FILES.length} WASM-Dateien nach public/mediapipe/wasm kopiert.`);
