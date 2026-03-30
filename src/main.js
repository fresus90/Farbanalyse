// ═══════════════════════════════════════════
// Farbanalyse App – Einstiegspunkt
// ═══════════════════════════════════════════

import './styles/main.css';
import { COLOR_TYPES, SWIPE_TYPES } from './data/colorTypes.js';
import { onTypeChange, buildSwatches, setBackground, currentSwatch } from './modules/palette/palette.js';
import {
  handleFile, showInView, showObPhotoPreview, handleObPhoto, captureObPhoto,
  openGuide, closeGuide, confirmGuide,
  openLiveCamera, openLiveCameraForOb, closeLiveCamera, flipCamera, capturePhoto
} from './modules/photo/photo.js';
import { openEdit, cancelEdit, applyEdit, switchTab } from './modules/editor/editor.js';
import { openCompare, closeCompare, onCmpTypeChange, onCmpGradToggle } from './modules/compare/compare.js';
import {
  goToScreen, applyQuizResult, skipQuiz,
  swipeLike, swipeNope, nextQuizStep
} from './modules/quiz/quiz.js';

// ── App state ──
export const state = {
  activeTypeKey: 'summer_cool',
  originalDataUrl: null,
  cutoutDataUrl: null,
  finalDataUrl: null,
  obPhotoDataUrl: null,
};

// Make state & key functions available globally
// (needed for inline onclick handlers in HTML)
Object.assign(window, {
  state,
  goToScreen, skipQuiz, applyQuizResult,
  swipeLike, swipeNope, nextQuizStep,
  openEdit, cancelEdit, applyEdit, switchTab,
  openCompare, closeCompare, onCmpTypeChange, onCmpGradToggle,
  openGuide, closeGuide, confirmGuide,
  openLiveCamera, openLiveCameraForOb, closeLiveCamera, flipCamera, capturePhoto, captureObPhoto,
  handleObPhoto,
  // type change
  onTypeChange: (key) => onTypeChange(key, state),
  // camera error helper
  openInNewTab: () => {
    const src = document.documentElement.outerHTML;
    const blob = new Blob([src], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'farbanalyse.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
});

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  // Start on welcome screen
  onTypeChange('summer_cool', state);
  goToScreen('obWelcome');

  // Upload zone
  const uz = document.getElementById('uploadZone');
  const fi = document.getElementById('fileInput');
  if (uz) {
    uz.addEventListener('click', e => {
      if (e.target.id === 'skipBgRemoval' || e.target.htmlFor === 'skipBgRemoval') return;
      openGuide();
    });
    uz.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('drag-over'); });
    uz.addEventListener('dragleave', () => uz.classList.remove('drag-over'));
    uz.addEventListener('drop', e => {
      e.preventDefault(); uz.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) handleFile(f, state);
    });
  }
  if (fi) fi.addEventListener('change', () => { if (fi.files[0]) handleFile(fi.files[0], state); });

  // Ob photo input
  const obInput = document.getElementById('obPhotoInput');
  if (obInput) obInput.addEventListener('change', () => handleObPhoto(obInput, state));

  // Reset
  const rb = document.getElementById('resetBtn');
  if (rb) rb.addEventListener('click', () => {
    const s = id => document.getElementById(id);
    const fi2 = s('faceImg'); if (fi2) { fi2.style.display = 'none'; fi2.src = ''; }
    if (s('viewActions'))      s('viewActions').style.display = 'none';
    if (s('palettesWrap'))     s('palettesWrap').style.display = 'none';
    if (s('avoidPaletteWrap')) s('avoidPaletteWrap').style.display = 'none';
    const uz2 = s('uploadZone'); if (uz2) uz2.style.display = 'flex';
    if (s('colorBg'))     s('colorBg').style.backgroundColor = '#1a1f2a';
    if (s('activeLabel')) s('activeLabel').style.opacity = '0';
    const fi3 = document.getElementById('fileInput'); if (fi3) fi3.value = '';
    state.originalDataUrl = null;
    state.cutoutDataUrl = null;
    state.finalDataUrl = null;
  });

  // Edit / Compare
  const eb = document.getElementById('editBtn');
  if (eb) eb.addEventListener('click', openEdit);
  const cb = document.getElementById('compareBtn');
  if (cb) cb.addEventListener('click', openCompare);

  // Type dropdown
  const td = document.getElementById('typeDropdown');
  if (td) td.addEventListener('change', () => onTypeChange(td.value, state));
});
