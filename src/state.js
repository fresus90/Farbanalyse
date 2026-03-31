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
  resetTouchup();
}

/**
 * Hilfsfunktion: DOM-Element per ID holen (null-safe)
 */
export function $(id) {
  return document.getElementById(id);
}
