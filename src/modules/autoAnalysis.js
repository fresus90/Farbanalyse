/**
 * autoAnalysis.js — verbindet die Erscheinungsbild-Analyse mit der Haupt-App.
 *
 * Vorher lief die gesamte Analyse-Pipeline ausschliesslich in debug.html:
 * src/main.js hat skinAnalysis.js nie importiert, und analyzeSkin() — der
 * Landmark-Pfad samt Sklera-Weissabgleich — wurde nirgends aufgerufen. In
 * index.html liess sich der Farbtyp nur von Hand im Dropdown waehlen, das
 * Kernversprechen der App existierte also nicht in der App.
 *
 * skinAnalysis.js wird dynamisch importiert: MediaPipe kommt vom CDN und soll
 * das Haupt-Bundle nicht aufblaehen oder den ersten Seitenaufbau blockieren.
 */

import { state, $ } from '../state.js';
import { onTypeChange } from './colorView.js';
import { currentScreen } from './screens.js';

let lastAnalyzedUrl = null;
let running = false;

function banner(mode, title, sub) {
  const el = $('analysisBanner');
  if (!el) return;
  el.dataset.visible = '1';
  // Die Analyse laeuft asynchron weiter, waehrend der Nutzer schon im Edit- oder
  // Vergleichsmodus sein kann. Dann nur den Zustand merken — showScreen('view')
  // blendet den Banner beim Zurueckkehren ein.
  el.style.display = currentScreen() === 'view' ? 'flex' : 'none';
  el.className = 'analysis-banner ' + mode;
  const icon = $('abIcon'), t = $('abTitle'), s = $('abSub');
  if (icon) icon.textContent = mode === 'busy' ? '⏳' : mode === 'ok' ? '✓' : 'ℹ';
  if (t) t.textContent = title;
  if (s) s.textContent = sub || '';
}

function hideBanner() {
  const el = $('analysisBanner');
  if (el) { el.style.display = 'none'; el.dataset.visible = '0'; }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = url;
  });
}

/**
 * Analysiert das aktuelle Foto und stellt den erkannten Farbtyp ein.
 * Laeuft auf dem Originalbild, nicht auf dem freigestellten: die Kantenglaettung
 * der Hintergrund-Entfernung veraendert Randpixel, und die Analyse braucht
 * unveraenderte Messwerte.
 */
export async function runAutoAnalysis() {
  const url = state.originalDataUrl;
  if (!url || running) return;
  // Nach Crop/Touch-up wird showInView erneut aufgerufen — nur bei wirklich
  // neuem Bild noch einmal durch MediaPipe schicken.
  if (url === lastAnalyzedUrl) return;

  running = true;
  banner('busy', 'Farbtyp wird bestimmt…', 'Gesicht wird analysiert');

  try {
    const { analyzeSkin } = await import('./skinAnalysis.js');
    const img = await loadImage(url);
    const result = await analyzeSkin(img, null, state.personMask);

    if (!result.success) {
      state.analysis = null;
      banner('info', 'Farbtyp nicht automatisch erkennbar',
        `${result.error} Du kannst deinen Typ unten selbst wählen.`);
      return;
    }

    lastAnalyzedUrl = url;
    state.analysis = result;
    onTypeChange(result.topType);

    const top = result.scores[0];
    const second = result.scores[1];
    const level = result.topConfidence >= 62 ? 'hohe' : result.topConfidence >= 42 ? 'mittlere' : 'geringe';
    const base = `${level} Sicherheit (${result.topConfidence}%) · nächster: ${second.name} (${second.pct}%)`;

    // Sagt das Foto selbst, dass es nichts taugt, hat das Vorrang vor dem
    // Ergebnis — ein Farbtyp aus einem Kunstlichtfoto sieht genauso
    // selbstbewusst aus wie einer aus gutem Tageslicht.
    const hints = result.quality?.hints ?? [];
    if (hints.length) {
      banner('info', `Unsicheres Ergebnis: ${top.name}`,
        `${base}. ${hints[0]} ${hints.length > 1 ? `(+${hints.length - 1} weiterer Hinweis)` : ''}`.trim());
    } else {
      banner('ok', `Dein Farbtyp: ${top.name}`, `${base} · unten änderbar`);
    }
  } catch (err) {
    console.error('Automatische Analyse fehlgeschlagen:', err);
    state.analysis = null;
    banner('info', 'Automatische Analyse nicht verfügbar',
      'Wähle deinen Farbtyp unten selbst aus.');
  } finally {
    running = false;
  }
}

export function initAutoAnalysis() {
  document.addEventListener('photo-ready', runAutoAnalysis);

  const dismiss = $('abDismiss');
  if (dismiss) dismiss.addEventListener('click', hideBanner);

  // Waehlt der Nutzer selbst einen Typ, ist die Automatik-Meldung ueberholt.
  const dd = $('typeDropdown');
  if (dd) dd.addEventListener('change', hideBanner);
}

export function resetAutoAnalysis() {
  lastAnalyzedUrl = null;
  hideBanner();
}
