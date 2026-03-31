/**
 * Compare-Modul — Split-Screen Farbtyp-Vergleich
 * FIX: Event-Listener werden bei erneutem Öffnen korrekt aufgeräumt
 */

import { state, $ } from '../state.js';
import { colorTypes } from './colorView.js';

const cmp = state.compare;

const SEASON_GROUPS = {
  '🌸 Frühling': ['spring_light', 'spring_warm', 'spring_clear'],
  '☀️ Sommer': ['summer_light', 'summer_cool', 'summer_soft'],
  '🍂 Herbst': ['autumn_soft', 'autumn_warm', 'autumn_deep'],
  '❄️ Winter': ['winter_cool', 'winter_deep', 'winter_clear']
};

/**
 * Compare-Modus öffnen
 */
export function openCompare() {
  if (!state.finalDataUrl) return;

  // Dropdowns befüllen
  ['cmpTypeLeft', 'cmpTypeRight'].forEach(id => {
    const sel = $(id);
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);

    Object.entries(SEASON_GROUPS).forEach(([label, keys]) => {
      const og = document.createElement('optgroup');
      og.label = label;
      keys.forEach(k => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = colorTypes[k].name;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  });

  // Aktiven Typ links voreinstellen
  const cur = $('typeDropdown');
  if (cur) {
    $('cmpTypeLeft').value = cur.value;
    onCmpTypeChange('left', cur.value);
  }
  onCmpTypeChange('right', '');

  // Gesichtsbild setzen
  const ci = $('cmpFaceImg');
  if (ci) ci.src = state.finalDataUrl;

  $('viewMode').style.display = 'none';
  $('compareMode').style.display = 'block';

  updateCmpDivider();
  setupCmpDrag();
}

export function closeCompare() {
  // Cleanup
  if (cmp._cleanupFn) {
    cmp._cleanupFn();
    cmp._cleanupFn = null;
  }
  $('compareMode').style.display = 'none';
  $('viewMode').style.display = 'block';
}

/**
 * Divider-Drag-Events mit Cleanup
 */
function setupCmpDrag() {
  // Vorherige Listener entfernen
  if (cmp._cleanupFn) {
    cmp._cleanupFn();
    cmp._cleanupFn = null;
  }

  const stage = $('cmpStage');
  const div = $('cmpDivider');
  if (!stage || !div) return;

  function setFromEvent(e) {
    const t = e.touches ? e.touches[0] : e;
    const r = stage.getBoundingClientRect();
    cmp.dividerPct = Math.min(95, Math.max(5, (t.clientX - r.left) / r.width * 100));
    updateCmpDivider();
  }

  function onMouseDown(e) { cmp.dragging = true; e.preventDefault(); }
  function onMouseMove(e) { if (cmp.dragging) setFromEvent(e); }
  function onMouseUp()    { cmp.dragging = false; }
  function onTouchStart(e) { cmp.dragging = true; e.preventDefault(); }
  function onTouchMove(e)  { if (cmp.dragging) setFromEvent(e); }
  function onTouchEnd()    { cmp.dragging = false; }

  div.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  div.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);

  cmp._cleanupFn = () => {
    div.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    div.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
  };
}

function updateCmpDivider() {
  const p = cmp.dividerPct;
  const d = $('cmpDivider');   if (d)  d.style.left = p + '%';
  const bl = $('cmpBgLeft');   if (bl) bl.style.right = (100 - p) + '%';
  const br = $('cmpBgRight');  if (br) br.style.left = p + '%';
  const gl = $('cmpGradLeft'); if (gl) gl.style.right = (100 - p) + '%';
  const gr = $('cmpGradRight');if (gr) gr.style.left = p + '%';
}

/**
 * Farbtyp-Wechsel pro Seite
 */
export function onCmpTypeChange(side, key) {
  cmp[side].typeKey = key;

  const swId = side === 'left' ? 'cmpSwatchesLeft' : 'cmpSwatchesRight';
  const container = $(swId);
  if (!container) return;
  container.innerHTML = '';

  if (!key) {
    applyCmpBackground(side, '');
    updateCmpLabel(side, side === 'left' ? 'Links' : 'Rechts');
    return;
  }

  const t = colorTypes[key];
  updateCmpLabel(side, t.name);

  const togId = side === 'left' ? 'cmpGradToggleLeft' : 'cmpGradToggleRight';

  t.good.forEach(item => {
    const d = document.createElement('div');
    d.className = 'cmp-swatch';
    d.style.background = item.hex;
    d.title = item.name;

    d.addEventListener('click', () => {
      const tog = $(togId);
      if (tog) tog.checked = false;
      cmp[side].gradActive = false;
      container.querySelectorAll('.cmp-swatch').forEach(s => s.classList.remove('active'));
      d.classList.add('active');
      cmp[side].color = item.hex;
      applyCmpBackground(side, item.hex);
    });

    container.appendChild(d);
  });

  if (cmp[side].gradActive) {
    applyCmpGradient(side);
  } else {
    cmp[side].color = t.good[0].hex;
    applyCmpBackground(side, t.good[0].hex);
    const f = container.querySelector('.cmp-swatch');
    if (f) f.classList.add('active');
  }
}

export function onCmpGradToggle(side) {
  const id = side === 'left' ? 'cmpGradToggleLeft' : 'cmpGradToggleRight';
  const cb = $(id);
  if (!cb) return;
  cmp[side].gradActive = cb.checked;
  if (cb.checked) applyCmpGradient(side);
  else applyCmpBackground(side, cmp[side].color);
}

function applyCmpBackground(side, color) {
  const bg = $(side === 'left' ? 'cmpBgLeft' : 'cmpBgRight');
  if (bg) bg.style.background = color || '#1a1f2a';
  const gr = $(side === 'left' ? 'cmpGradLeft' : 'cmpGradRight');
  if (gr) gr.style.opacity = '0';
}

function applyCmpGradient(side) {
  if (!cmp[side].typeKey) return;
  const t = colorTypes[cmp[side].typeKey];
  const stops = t.good.map((c, i) => c.hex + ' ' + Math.round(i / (t.good.length - 1) * 100) + '%').join(',');
  const gr = $(side === 'left' ? 'cmpGradLeft' : 'cmpGradRight');
  const bg = $(side === 'left' ? 'cmpBgLeft' : 'cmpBgRight');
  if (gr) { gr.style.background = 'linear-gradient(to bottom,' + stops + ')'; gr.style.opacity = '1'; }
  if (bg) bg.style.background = 'transparent';
}

function updateCmpLabel(side, text) {
  const e = $(side === 'left' ? 'cmpLabelLeft' : 'cmpLabelRight');
  if (e) e.textContent = text;
}

/**
 * Initialisiert Compare-Event-Listener (Dropdowns + Gradient-Toggles)
 */
export function initCompare() {
  const selLeft = $('cmpTypeLeft');
  const selRight = $('cmpTypeRight');
  if (selLeft) selLeft.addEventListener('change', () => onCmpTypeChange('left', selLeft.value));
  if (selRight) selRight.addEventListener('change', () => onCmpTypeChange('right', selRight.value));

  const togLeft = $('cmpGradToggleLeft');
  const togRight = $('cmpGradToggleRight');
  if (togLeft) togLeft.addEventListener('change', () => onCmpGradToggle('left'));
  if (togRight) togRight.addEventListener('change', () => onCmpGradToggle('right'));
}
