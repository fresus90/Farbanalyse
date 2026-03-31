/**
 * Crop-Modul — Bildausschnitt anpassen
 * FIX: Event-Listener werden jetzt sauber entfernt bei erneutem Öffnen
 */

import { state, $ } from '../state.js';
import { showInView } from './upload.js';

/**
 * Crop initialisieren
 */
export function initCrop() {
  const img = $('cropSourceImg');
  if (!img) return;

  img.src = state.originalDataUrl;
  img.onload = () => {
    const wrap = $('cropWrap');
    if (wrap) {
      wrap.style.height = (wrap.offsetWidth * (img.naturalHeight / img.naturalWidth)) + 'px';
    }
    state.crop.box = { x: 5, y: 5, w: 90, h: 90 };
    renderCropBox();
  };

  setupCropEvents();
}

function renderCropBox() {
  const box = $('cropBox');
  const b = state.crop.box;
  if (!box) return;
  box.style.left = b.x + '%';
  box.style.top = b.y + '%';
  box.style.width = b.w + '%';
  box.style.height = b.h + '%';
}

/**
 * Event-Listener Setup — mit Cleanup-Funktion
 */
function setupCropEvents() {
  // Alte Listener entfernen falls vorhanden
  if (state.crop._cleanupFn) {
    state.crop._cleanupFn();
    state.crop._cleanupFn = null;
  }

  const wrap = $('cropWrap');
  const box = $('cropBox');
  if (!wrap || !box) return;

  function getPos(e) {
    const r = wrap.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) / r.width * 100,
      y: (t.clientY - r.top) / r.height * 100
    };
  }

  function onBoxMouseDown(e) {
    if (e.target !== box) return;
    state.crop.dragging = true;
    const p = getPos(e);
    state.crop.startX = p.x - state.crop.box.x;
    state.crop.startY = p.y - state.crop.box.y;
    e.preventDefault();
  }

  function onBoxTouchStart(e) {
    if (e.target !== box) return;
    state.crop.dragging = true;
    const p = getPos(e);
    state.crop.startX = p.x - state.crop.box.x;
    state.crop.startY = p.y - state.crop.box.y;
    e.preventDefault();
  }

  box.addEventListener('mousedown', onBoxMouseDown);
  box.addEventListener('touchstart', onBoxTouchStart, { passive: false });

  // Handle-Listener
  const handleCleanups = [];
  const handles = [['h-tl', 'tl'], ['h-tr', 'tr'], ['h-bl', 'bl'], ['h-br', 'br']];

  handles.forEach(([id, type]) => {
    const h = $(id);
    if (!h) return;

    function start(e) {
      state.crop.resizing = type;
      const p = getPos(e);
      state.crop.startX = p.x;
      state.crop.startY = p.y;
      state.crop._origBox = { ...state.crop.box };
      e.stopPropagation();
      e.preventDefault();
    }

    h.addEventListener('mousedown', start);
    h.addEventListener('touchstart', start, { passive: false });
    handleCleanups.push(() => {
      h.removeEventListener('mousedown', start);
      h.removeEventListener('touchstart', start);
    });
  });

  function onMove(e) {
    const p = getPos(e);
    if (state.crop.dragging) {
      const nx = Math.max(0, Math.min(p.x - state.crop.startX, 100 - state.crop.box.w));
      const ny = Math.max(0, Math.min(p.y - state.crop.startY, 100 - state.crop.box.h));
      state.crop.box.x = nx;
      state.crop.box.y = ny;
      renderCropBox();
    } else if (state.crop.resizing) {
      const ob = state.crop._origBox;
      const dx = p.x - state.crop.startX;
      const dy = p.y - state.crop.startY;
      let { x, y, w, h } = ob;
      const r = state.crop.resizing;

      if (r === 'tl') { x = Math.min(ob.x + ob.w - 5, ob.x + dx); y = Math.min(ob.y + ob.h - 5, ob.y + dy); w = ob.x + ob.w - x; h = ob.y + ob.h - y; }
      if (r === 'tr') { w = Math.max(5, ob.w + dx); y = Math.min(ob.y + ob.h - 5, ob.y + dy); h = ob.y + ob.h - y; }
      if (r === 'bl') { x = Math.min(ob.x + ob.w - 5, ob.x + dx); w = ob.x + ob.w - x; h = Math.max(5, ob.h + dy); }
      if (r === 'br') { w = Math.max(5, ob.w + dx); h = Math.max(5, ob.h + dy); }

      x = Math.max(0, x); y = Math.max(0, y);
      if (x + w > 100) w = 100 - x;
      if (y + h > 100) h = 100 - y;

      state.crop.box = { x, y, w, h };
      renderCropBox();
    }
  }

  function onEnd() {
    state.crop.dragging = false;
    state.crop.resizing = null;
  }

  wrap.addEventListener('mousemove', onMove);
  wrap.addEventListener('mouseup', onEnd);
  wrap.addEventListener('touchmove', onMove, { passive: false });
  wrap.addEventListener('touchend', onEnd);

  // Cleanup-Funktion speichern
  state.crop._cleanupFn = () => {
    box.removeEventListener('mousedown', onBoxMouseDown);
    box.removeEventListener('touchstart', onBoxTouchStart);
    wrap.removeEventListener('mousemove', onMove);
    wrap.removeEventListener('mouseup', onEnd);
    wrap.removeEventListener('touchmove', onMove);
    wrap.removeEventListener('touchend', onEnd);
    handleCleanups.forEach(fn => fn());
  };
}

/**
 * Crop anwenden
 */
export function applyCrop() {
  const img = $('cropSourceImg');
  const b = state.crop.box;
  if (!img) return;

  const sx = img.naturalWidth * b.x / 100;
  const sy = img.naturalHeight * b.y / 100;
  const sw = img.naturalWidth * b.w / 100;
  const sh = img.naturalHeight * b.h / 100;

  const wc = $('workCanvas');
  wc.width = sw;
  wc.height = sh;
  wc.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const cropped = wc.toDataURL('image/png');
  state.originalDataUrl = cropped;
  state.cutoutDataUrl = cropped;
  state.finalDataUrl = cropped;

  // Cleanup
  if (state.crop._cleanupFn) {
    state.crop._cleanupFn();
    state.crop._cleanupFn = null;
  }

  $('editMode').style.display = 'none';
  $('viewMode').style.display = 'block';
  showInView(state.finalDataUrl);
}

/**
 * Destroy — aufräumen wenn Modul nicht mehr gebraucht wird
 */
export function destroyCrop() {
  if (state.crop._cleanupFn) {
    state.crop._cleanupFn();
    state.crop._cleanupFn = null;
  }
}
