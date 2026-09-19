/**
 * Zentraler App-State
 * Ersetzt alle globalen Variablen der monolithischen Version.
 * Importiere nur was du brauchst: import { state } from './state.js'
 */

export const state = {
  // Bild-Daten
  originalDataUrl: null,
  cutoutDataUrl: null,
  finalDataUrl: null,
  obPhotoDataUrl: null,

  // Aktiver Farbtyp
  activeTypeKey: 'summer_cool',

  // Ergebnis der automatischen Analyse (null = noch keine gelaufen)
  analysis: null,

  // Welches Freistell-Verfahren zuletzt lief: 'segmentation' | 'floodfill' | 'none'
  cutoutMethod: null,

  // Personenmaske aus dem Freistellen; die Analyse grenzt damit das Haar
  // gegen den Hintergrund ab. null = keine verfuegbar.
  personMask: null,

  // UI
  currentSwatch: null,
  labelTimer: null,

  // Kamera
  camStream: null,
  camFacing: 'user',

  // Crop
  crop: {
    dragging: false,
    resizing: null,
    startX: 0,
    startY: 0,
    box: { x: 5, y: 5, w: 90, h: 90 },
    _origBox: null,
    _cleanupFn: null  // zum Entfernen von Event-Listenern
  },

  // Touchup
  touchup: {
    canvas: null,
    ctx: null,
    cursorCanvas: null,
    cursorCtx: null,
    imageData: null,
    origImageData: null,
    W: 0,
    H: 0,
    tool: 'erase',
    painting: false,
    undoStack: [],
    scale: 1,
    offX: 0,
    offY: 0,
    pinching: false,
    lastPinchDist: 0,
    pinchMidX: 0,
    pinchMidY: 0,
    panning: false,
    lastPanX: 0,
    lastPanY: 0
  },

  // Compare
  compare: {
    dividerPct: 50,
    dragging: false,
    left:  { typeKey: '', color: '#4a7fa5', gradActive: false },
    right: { typeKey: '', color: '#1a2e4a', gradActive: false },
    _cleanupFn: null
  }
};

/**
 * Reset Touchup-State auf Defaults
 */
export function resetTouchup() {
  Object.assign(state.touchup, {
    canvas: null, ctx: null, cursorCanvas: null, cursorCtx: null,
    imageData: null, origImageData: null, W: 0, H: 0,
    tool: 'erase', painting: false, undoStack: [],
    scale: 1, offX: 0, offY: 0,
    pinching: false, lastPinchDist: 0, pinchMidX: 0, pinchMidY: 0,
    panning: false, lastPanX: 0, lastPanY: 0
  });
}

/**
 * Vollständiger Reset (z.B. bei "Entfernen"-Button)
 */
export function resetAll() {
  state.originalDataUrl = null;
  state.cutoutDataUrl = null;
  state.finalDataUrl = null;
  state.obPhotoDataUrl = null;
  state.currentSwatch = null;
  state.analysis = null;
  state.cutoutMethod = null;
  state.personMask = null;
  resetTouchup();

  // FIX: crop und compare blieben beim Zuruecksetzen stehen — inklusive noch
  // registrierter Event-Listener und einer alten Crop-Box.
  if (state.crop._cleanupFn) state.crop._cleanupFn();
  Object.assign(state.crop, {
    dragging: false, resizing: null, startX: 0, startY: 0,
    box: { x: 5, y: 5, w: 90, h: 90 }, _origBox: null, _cleanupFn: null
  });

  if (state.compare._cleanupFn) state.compare._cleanupFn();
  Object.assign(state.compare, {
    dividerPct: 50, dragging: false,
    left:  { typeKey: '', color: '#4a7fa5', gradActive: false },
    right: { typeKey: '', color: '#1a2e4a', gradActive: false },
    _cleanupFn: null
  });
}

/**
 * Hilfsfunktion: DOM-Element per ID holen (null-safe)
 */
export function $(id) {
  return document.getElementById(id);
}
