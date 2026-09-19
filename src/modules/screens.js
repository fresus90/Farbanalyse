/**
 * screens.js — ein einziger Ort, an dem zwischen den Screens umgeschaltet wird,
 * inklusive Hash-Routing.
 *
 * Vorher schaltete jedes Modul die Screens selbst um (main.js, crop.js,
 * touchup.js, compare.js setzten alle direkt style.display). Dabei blieben
 * #typeSelectorWrap und #typeCard immer sichtbar — sie liegen in index.html
 * ausserhalb von #viewMode und wurden nirgends versteckt. Die Zusatzelemente
 * haengen jetzt am View-Screen.
 *
 * Das Hash-Routing kam mit der Stilberatung dazu: Als installierte PWA im
 * Standalone-Modus wuerde die Android-Zurueck-Geste ohne History-Eintraege die
 * App verlassen, statt einen Screen zurueckzugehen. src/router.js hatte das
 * einmal vorbereitet, wurde aber nie importiert — dessen Aufgabe uebernimmt
 * jetzt diese Datei, damit es nicht zwei Screen-Verwaltungen nebeneinander gibt.
 */

import { $ } from '../state.js';

const SCREENS = {
  view:    { id: 'viewMode',    display: 'block', hash: 'farbe' },
  style:   { id: 'styleMode',   display: 'block', hash: 'stil' },
  edit:    { id: 'editMode',    display: 'block', hash: 'bearbeiten' },
  compare: { id: 'compareMode', display: 'block', hash: 'vergleich' }
};

/** Zusatzelemente, die zum View-Screen gehoeren, aber ausserhalb liegen. */
const VIEW_CHROME = {
  analysisBanner:   'flex',
  typeSelectorWrap: 'block',
  typeCard:         'flex',
  offlineCard:      'block'
};

/** In welchen Screens die Hauptnavigation sichtbar ist. */
const NAV_SCREENS = new Set(['view', 'style']);

const byHash = Object.fromEntries(Object.entries(SCREENS).map(([k, v]) => [v.hash, k]));

let current = null;
let applyingHash = false;
const listeners = new Set();

/**
 * @param {string} name   Screen-Schluessel
 * @param {{push?:boolean}} [opts]  push=false unterdrueckt das Setzen des Hash
 *                                  (wird vom hashchange-Handler genutzt)
 */
export function showScreen(name, { push = true } = {}) {
  if (!SCREENS[name]) return;

  for (const [key, cfg] of Object.entries(SCREENS)) {
    const el = $(cfg.id);
    if (el) el.style.display = key === name ? cfg.display : 'none';
  }

  for (const [id, display] of Object.entries(VIEW_CHROME)) {
    const el = $(id);
    if (!el) continue;
    if (name !== 'view') {
      el.style.display = 'none';
    } else if (id === 'analysisBanner') {
      // Der Banner hat einen eigenen Sichtbarkeitszustand (leer / ausgeblendet)
      // und wird beim Zurueckkehren nicht ungefragt wieder eingeblendet.
      el.style.display = el.dataset.visible === '1' ? display : 'none';
    } else {
      el.style.display = display;
    }
  }

  const nav = $('appNav');
  if (nav) nav.style.display = NAV_SCREENS.has(name) ? 'flex' : 'none';
  document.querySelectorAll('#appNav [data-screen]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });

  const previous = current;
  current = name;

  if (push && !applyingHash) {
    const target = '#' + SCREENS[name].hash;
    if (window.location.hash !== target) window.location.hash = target;
  }

  if (previous !== name) {
    for (const fn of listeners) {
      try { fn(name, previous); } catch (err) { console.error(err); }
    }
  }
}

export function currentScreen() { return current; }

/** Callback bei jedem Screen-Wechsel. Gibt eine Abmeldefunktion zurueck. */
export function onScreenChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hash-Listener starten und den Screen aus der URL herstellen. */
export function initScreens(defaultScreen = 'view') {
  window.addEventListener('hashchange', () => {
    const name = byHash[window.location.hash.slice(1)];
    if (!name || name === current) return;
    applyingHash = true;
    showScreen(name, { push: false });
    applyingHash = false;
  });

  const initial = byHash[window.location.hash.slice(1)] ?? defaultScreen;
  // Beim ersten Aufbau keinen zusaetzlichen History-Eintrag erzeugen.
  applyingHash = true;
  showScreen(initial, { push: false });
  applyingHash = false;
  if (!window.location.hash) {
    window.history.replaceState(null, '', '#' + SCREENS[initial].hash);
  }
}
