/**
 * PWA-Schicht: Service-Worker-Registrierung, Update-Hinweis und bewusstes
 * Vorladen der großen Assets für die Offline-Nutzung.
 *
 * Zwei Entscheidungen prägen das Verhalten:
 *   1. Kein automatisches Neuladen. Ein Reload mitten in einer Analyse oder im
 *      Freistell-Editor würde Foto, Crop und Retusche verwerfen — der Nutzer
 *      entscheidet, wann aktualisiert wird.
 *   2. Modell (~3,8 MB) und WASM-Laufzeit (~11 MB) werden nicht bei der
 *      Installation vorgeladen, sondern beim ersten Gebrauch gecacht oder
 *      explizit über "Für Offline-Nutzung vorbereiten".
 */

import { registerSW } from 'virtual:pwa-register';
import { $ } from '../state.js';
import { MODEL_SOURCES, WASM_PATH } from '../config/face.js';
import { SEGMENTER_SOURCES } from '../config/segmentation.js';

/** Lokale Modell-URLs (jeweils erste Quelle; die zweite ist der CDN-Fallback). */
const LOCAL_MODEL_URL = MODEL_SOURCES[0];
const LOCAL_SEGMENTER_URL = SEGMENTER_SOURCES[0];

/** Je nach SIMD-Unterstützung lädt MediaPipe eine dieser Laufzeiten. */
const WASM_BINARIES = [
  `${WASM_PATH}/vision_wasm_internal.wasm`,
  `${WASM_PATH}/vision_wasm_nosimd_internal.wasm`
];

let updateServiceWorker = null;
let reloadTriggered = false;

export function initPwa() {
  $('prepareOfflineBtn')?.addEventListener('click', prepareOffline);
  $('updateNowBtn')?.addEventListener('click', applyUpdate);
  $('updateLaterBtn')?.addEventListener('click', () => toggleUpdateBanner(false));

  if (!('serviceWorker' in navigator)) {
    showOfflineStatus('Dieser Browser unterstützt keine Service Worker – Offline-Nutzung ist nicht möglich.');
    return;
  }

  updateServiceWorker = registerSW({
    onNeedRefresh: () => toggleUpdateBanner(true),
    onOfflineReady: () => refreshOfflineStatus(),
    onRegisterError: (error) => {
      console.error(error);
      showOfflineStatus(`Service Worker konnte nicht registriert werden: ${error.message}`);
    }
  });

  refreshOfflineStatus();
}

/**
 * Übernimmt das Update: neuen Worker aktivieren und die Seite neu laden.
 *
 * Das Neuladen passiert hier selbst und nicht implizit über die
 * Registrierungs-Hilfe: Mit `clientsClaim` übernimmt der neue Worker die Seite,
 * ohne dass deren Reload-Automatik greift – die Seite liefe sonst mit neuem
 * Worker, aber altem HTML weiter.
 */
async function applyUpdate() {
  toggleUpdateBanner(false);
  navigator.serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true });

  try {
    await updateServiceWorker?.(true);
  } catch (error) {
    console.error(error);
  }

  // Sicherheitsnetz, falls kein controllerchange eintrifft.
  setTimeout(reloadOnce, 3000);
}

function reloadOnce() {
  if (reloadTriggered) return;
  reloadTriggered = true;
  window.location.reload();
}

/**
 * Wartet, bis der Service Worker die Seite kontrolliert.
 *
 * Direkt nach der ersten Installation ist das noch nicht der Fall; Anfragen
 * liefen dann am Worker vorbei und würden nicht gecacht.
 */
async function waitForController(timeoutMs = 10000) {
  if (!('serviceWorker' in navigator)) return false;
  if (navigator.serviceWorker.controller) return true;

  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return true;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      clearTimeout(timer);
      resolve(true);
    }, { once: true });
  });
}

/** Prüft, was bereits im Cache liegt. */
export async function readOfflineState() {
  if (!('caches' in window)) return { supported: false, model: false, runtime: false };

  const cached = async (url) => Boolean(await caches.match(url, { ignoreSearch: true }));
  const runtimeHits = await Promise.all(WASM_BINARIES.map(cached));

  const [face, segmenter] = await Promise.all([cached(LOCAL_MODEL_URL), cached(LOCAL_SEGMENTER_URL)]);
  return {
    supported: true,
    model: face && segmenter,
    runtime: runtimeHits.some(Boolean)
  };
}

export async function refreshOfflineStatus() {
  const state = await readOfflineState();
  if (!state.supported) {
    showOfflineStatus('Cache-Speicher steht nicht zur Verfügung – Offline-Nutzung ist nicht möglich.');
    return state;
  }

  if (state.model && state.runtime) {
    showOfflineStatus('Offline einsatzbereit: Modelle und Laufzeit liegen auf dem Gerät.', 'ready');
  } else if (state.model || state.runtime) {
    showOfflineStatus('Teilweise vorbereitet – für vollständige Offline-Nutzung bitte einmal vorbereiten.', 'partial');
  } else {
    showOfflineStatus('Noch nicht offline-fähig. Modell und Laufzeit werden bei der ersten Analyse geladen.', 'pending');
  }
  return state;
}

/**
 * Lädt Laufzeit und Modell aktiv in den Cache, indem der Face Landmarker einmal
 * initialisiert wird – so wird genau die Variante geladen, die dieses Gerät
 * auch später braucht (SIMD oder nicht).
 */
export async function prepareOffline() {
  const button = $('prepareOfflineBtn');
  if (button) button.disabled = true;

  try {
    showOfflineStatus('Service Worker wird aktiviert …', 'loading');
    const controlled = await waitForController();
    if (!controlled) {
      showOfflineStatus('Service Worker kontrolliert die Seite noch nicht – bitte Seite neu laden und erneut versuchen.', 'partial');
      return;
    }

    showOfflineStatus('Laufzeit und Modelle werden geladen …', 'loading');
    const status = (message) => showOfflineStatus(message, 'loading');
    const [{ initSkinAnalysis }, { ensureSegmenter }] = await Promise.all([
      import('./skinAnalysis.js'),
      import('../core/segmentation.js')
    ]);
    // Beide Modelle: ohne das Segmentierungs-Modell laesst sich offline zwar
    // der Farbtyp bestimmen, aber kein Foto freistellen.
    await initSkinAnalysis(status);
    await ensureSegmenter(status);

    const state = await refreshOfflineStatus();
    if (!state.model) {
      // Unterscheiden, ob das Modell fehlt (CDN-Fallback griff) oder nur noch
      // nicht im Cache gelandet ist – beides fühlt sich sonst gleich an.
      const local = await Promise.all([LOCAL_MODEL_URL, LOCAL_SEGMENTER_URL]
        .map((u) => fetch(u, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)));
      showOfflineStatus(local.every(Boolean)
        ? 'Modelle sind noch nicht im Cache – bitte erneut versuchen.'
        : 'Mindestens ein Modell wird nicht lokal ausgeliefert, sondern vom CDN geladen. Für echte Offline-Nutzung muss der Build "npm run assets:model" ausführen.',
        'partial');
    }
  } catch (error) {
    console.error(error);
    showOfflineStatus(`Vorbereitung fehlgeschlagen: ${error.message}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function showOfflineStatus(message, state = 'info') {
  const element = $('offlineStatus');
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}

function toggleUpdateBanner(visible) {
  const banner = $('updateBanner');
  if (banner) banner.hidden = !visible;
}
