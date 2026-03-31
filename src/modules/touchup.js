/**
 * Touchup-Modul — Erase/Restore Brush-Editor
 * FIX: keydown-Listener wird jetzt auch bei cancelEdit entfernt
 */

import { state, $, resetTouchup } from '../state.js';
import { showInView } from './upload.js';

const tu = state.touchup;

// Referenz auf den keydown-Handler, damit er entfernt werden kann
let undoKeyHandler = null;

export function setTool(t) {
  tu.tool = t;
  tu.painting = false;
  const btnRestore = $('btnRestore');
  const btnErase = $('btnErase');
  if (btnRestore) btnRestore.classList.toggle('active', t === 'restore');
  if (btnErase) btnErase.classList.toggle('active', t === 'erase');
  clearCursor();
}

function pushUndo() {
  if (tu.undoStack.length >= 20) tu.undoStack.shift();
  tu.undoStack.push(new ImageData(new Uint8ClampedArray(tu.imageData.data), tu.W, tu.H));
  updateUndoBtn();
}

export function doUndo() {
  if (!tu.undoStack.length) return;
  tu.imageData = tu.undoStack.pop();
  tu.ctx.putImageData(tu.imageData, 0, 0);
  updateUndoBtn();
}

function updateUndoBtn() {
  const btn = $('btnUndo');
  if (btn) {
    btn.disabled = !tu.undoStack.length;
    btn.style.opacity = tu.undoStack.length ? '1' : '.35';
  }
}

export function resetToOriginal() {
  if (!tu.origImageData) return;
  pushUndo();
  tu.imageData = new ImageData(new Uint8ClampedArray(tu.origImageData.data), tu.W, tu.H);
  tu.ctx.putImageData(tu.imageData, 0, 0);
}

function clampPan() {
  const wrap = $('touchupWrap');
  if (!wrap) return;
  const dw = wrap.clientWidth, dh = wrap.clientHeight;
  const iw = tu.W * tu.scale, ih = tu.H * tu.scale;
  tu.offX = Math.min(0, Math.max(tu.offX, dw - iw));
  tu.offY = Math.min(0, Math.max(tu.offY, dh - ih));
  if (iw < dw) tu.offX = (dw - iw) / 2;
  if (ih < dh) tu.offY = (dh - ih) / 2;
}

function applyTransform() {
  if (!tu.canvas) return;
  tu.canvas.style.transformOrigin = '0 0';
  tu.canvas.style.transform = `translate(${tu.offX}px,${tu.offY}px) scale(${tu.scale})`;
}

function zoomAt(cx, cy, factor) {
  tu.offX = cx - factor * (cx - tu.offX);
  tu.offY = cy - factor * (cy - tu.offY);
  tu.scale = Math.min(10, Math.max(1, tu.scale * factor));
  clampPan();
  applyTransform();
}

function getXY(e) {
  const r = tu.canvas.getBoundingClientRect();
  return {
    x: Math.round((e.clientX - r.left) * (tu.W / r.width)),
    y: Math.round((e.clientY - r.top) * (tu.H / r.height))
  };
}

function getScreenXY(e) {
  const r = $('touchupWrap').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function drawCursor(sx, sy) {
  if (!tu.cursorCanvas) return;
  const cc = tu.cursorCanvas, ctx = tu.cursorCtx;
  cc.width = cc.offsetWidth;
  cc.height = cc.offsetHeight;
  ctx.clearRect(0, 0, cc.width, cc.height);

  const sv = parseInt($('tuStrength').value);
  const cr = (Math.round(sv * 2) + 10) * (tu.canvas.getBoundingClientRect().width / tu.W);

  ctx.beginPath();
  ctx.arc(sx, sy, cr, 0, Math.PI * 2);
  ctx.strokeStyle = tu.tool === 'erase' ? 'rgba(220,80,60,0.85)' : 'rgba(80,160,80,0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(sx, sy, 2, 0, Math.PI * 2);
  ctx.fillStyle = tu.tool === 'erase' ? 'rgba(220,80,60,0.9)' : 'rgba(80,160,80,0.9)';
  ctx.fill();
}

function clearCursor() {
  if (tu.cursorCtx) {
    tu.cursorCtx.clearRect(0, 0, tu.cursorCanvas.width, tu.cursorCanvas.height);
  }
}

function applyBrush(e) {
  if (!tu.imageData) return;
  const pos = getXY(e);
  const d = tu.imageData.data, od = tu.origImageData.data;
  const W = tu.W, H = tu.H;

  const sv = parseInt($('tuStrength').value);
  const radius = Math.round(sv * 2) + 10;
  const r2 = radius * radius;

  for (let py = Math.max(0, pos.y - radius); py <= Math.min(H - 1, pos.y + radius); py++) {
    for (let px = Math.max(0, pos.x - radius); px <= Math.min(W - 1, pos.x + radius); px++) {
      const ddx = px - pos.x, ddy = py - pos.y;
      const dist2 = ddx * ddx + ddy * ddy;
      if (dist2 > r2) continue;

      const falloff = 1 - (Math.sqrt(dist2) / radius);
      const idx = (py * W + px) * 4;

      if (tu.tool === 'erase') {
        d[idx + 3] = Math.max(0, Math.round(d[idx + 3] * (1 - falloff * 0.95)));
      } else {
        const t = falloff * 0.95;
        d[idx]     = Math.round(d[idx]     + (od[idx]     - d[idx])     * t);
        d[idx + 1] = Math.round(d[idx + 1] + (od[idx + 1] - d[idx + 1]) * t);
        d[idx + 2] = Math.round(d[idx + 2] + (od[idx + 2] - d[idx + 2]) * t);
        d[idx + 3] = Math.min(od[idx + 3], Math.round(d[idx + 3] + (od[idx + 3] - d[idx + 3]) * t));
      }
    }
  }

  tu.ctx.putImageData(tu.imageData, 0, 0);
}

/**
 * Touchup-Editor initialisieren
 */
export function initTouchup() {
  const wrap = $('touchupWrap');
  const oldC = $('touchupCanvas');

  const newC = document.createElement('canvas');
  newC.id = 'touchupCanvas';
  newC.style.cssText = 'display:block;position:absolute;top:0;left:0;transform-origin:0 0;';
  oldC.replaceWith(newC);

  tu.canvas = newC;
  tu.ctx = newC.getContext('2d');
  tu.cursorCanvas = $('cursorCanvas');
  if (tu.cursorCanvas) tu.cursorCtx = tu.cursorCanvas.getContext('2d');
  tu.painting = false;
  tu.undoStack = [];
  tu.scale = 1;
  tu.offX = 0;
  tu.offY = 0;
  updateUndoBtn();

  const imgC = new Image();
  const imgO = new Image();
  let cReady = false, oReady = false;

  function tryInit() {
    if (!cReady || !oReady) return;
    const MAX = 900;
    let W = imgC.naturalWidth, H = imgC.naturalHeight;
    if (W > MAX) { H = Math.round(H * MAX / W); W = MAX; }
    if (H > MAX) { W = Math.round(W * MAX / H); H = MAX; }

    newC.width = W;
    newC.height = H;
    if (wrap) wrap.style.height = (wrap.offsetWidth * (H / W)) + 'px';

    tu.W = W;
    tu.H = H;
    tu.ctx.drawImage(imgC, 0, 0, W, H);
    tu.imageData = tu.ctx.getImageData(0, 0, W, H);

    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    off.getContext('2d').drawImage(imgO, 0, 0, W, H);
    tu.origImageData = off.getContext('2d').getImageData(0, 0, W, H);
    applyTransform();
  }

  imgC.onload = () => { cReady = true; tryInit(); };
  imgO.onload = () => { oReady = true; tryInit(); };
  imgC.src = state.cutoutDataUrl || state.originalDataUrl || '';
  imgO.src = state.originalDataUrl || state.cutoutDataUrl || '';

  // Mouse events
  newC.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.altKey) {
      tu.panning = true; tu.lastPanX = e.clientX; tu.lastPanY = e.clientY;
      e.preventDefault(); return;
    }
    pushUndo(); tu.painting = true; applyBrush(e); e.preventDefault();
  });

  newC.addEventListener('mousemove', (e) => {
    const s = getScreenXY(e);
    drawCursor(s.x, s.y);
    if (tu.panning) {
      tu.offX += e.clientX - tu.lastPanX; tu.offY += e.clientY - tu.lastPanY;
      tu.lastPanX = e.clientX; tu.lastPanY = e.clientY;
      clampPan(); applyTransform(); return;
    }
    if (tu.painting) applyBrush(e);
  });

  newC.addEventListener('mouseup', () => { tu.painting = false; tu.panning = false; });
  newC.addEventListener('mouseleave', () => { tu.painting = false; tu.panning = false; clearCursor(); });

  // Wheel zoom
  if (wrap) {
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
  }

  // Touch events
  newC.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length >= 2) {
      tu.painting = false; tu.pinching = true;
      tu.lastPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      tu.lastPanX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      tu.lastPanY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        tu.pinchMidX = tu.lastPanX - r.left;
        tu.pinchMidY = tu.lastPanY - r.top;
      }
      clearCursor();
    } else if (!tu.pinching) {
      pushUndo(); tu.painting = true; applyBrush(e.touches[0]);
      const s = getScreenXY(e.touches[0]); drawCursor(s.x, s.y);
    }
  }, { passive: false });

  newC.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length >= 2 && tu.pinching) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        zoomAt(mx - r.left, my - r.top, dist / tu.lastPinchDist);
      }
      tu.lastPinchDist = dist;
      tu.offX += mx - tu.lastPanX; tu.offY += my - tu.lastPanY;
      tu.lastPanX = mx; tu.lastPanY = my;
      clampPan(); applyTransform();
    } else if (e.touches.length === 1 && tu.painting) {
      applyBrush(e.touches[0]);
      const s = getScreenXY(e.touches[0]); drawCursor(s.x, s.y);
    }
  }, { passive: false });

  newC.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.touches.length === 0) { tu.painting = false; tu.pinching = false; clearCursor(); }
    else if (e.touches.length === 1) { tu.pinching = false; tu.painting = false; }
  }, { passive: false });

  // Keyboard undo
  undoKeyHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); doUndo(); }
  };
  document.addEventListener('keydown', undoKeyHandler);
}

/**
 * Touchup anwenden und zurück zur Ansicht
 */
export function applyTouchup() {
  cleanupKeyListener();
  state.finalDataUrl = tu.canvas.toDataURL('image/png');
  state.cutoutDataUrl = state.finalDataUrl;
  resetTouchup();
  $('editMode').style.display = 'none';
  $('viewMode').style.display = 'block';
  showInView(state.finalDataUrl);
}

/**
 * Cleanup — entfernt keydown-Listener (auch bei cancelEdit nutzbar!)
 */
export function cleanupKeyListener() {
  if (undoKeyHandler) {
    document.removeEventListener('keydown', undoKeyHandler);
    undoKeyHandler = null;
  }
}
