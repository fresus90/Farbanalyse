// ═══════════════════════════════════════════
// Farbanalyse App – Einstiegspunkt
// ═══════════════════════════════════════════

import './styles/main.css';
import { onTypeChange } from './modules/palette/palette.js';
import {
  handleFile, handleObPhoto, captureObPhoto,
  openGuide, closeGuide, confirmGuide,
  openLiveCamera, openLiveCameraForOb, closeLiveCamera, flipCamera, capturePhoto
} from './modules/photo/photo.js';
import {
  openEdit, cancelEdit, applyEdit, switchTab,
  setTool, doUndo, resetToOriginal
} from './modules/editor/editor.js';
import { openCompare, closeCompare, onCmpTypeChange, onCmpGradToggle } from './modules/compare/compare.js';
import { goToScreen, applyQuizResult, skipQuiz, swipeLike, swipeNope, nextQuizStep } from './modules/quiz/quiz.js';

// ── Zentraler State auf window ──
window.appState = {
  activeTypeKey: 'summer_cool',
  originalDataUrl: null,
  cutoutDataUrl: null,
  finalDataUrl: null,
  obPhotoDataUrl: null,
};
const state = window.appState;

// ── Alle Funktionen global verfügbar ──
Object.assign(window, {
  goToScreen, skipQuiz, applyQuizResult,
  swipeLike, swipeNope, nextQuizStep,
  openEdit, cancelEdit, applyEdit, switchTab, setTool, doUndo, resetToOriginal,
  openCompare, closeCompare, onCmpTypeChange, onCmpGradToggle,
  openGuide, closeGuide, confirmGuide,
  openLiveCamera, openLiveCameraForOb, closeLiveCamera, flipCamera, capturePhoto, captureObPhoto,
  handleObPhoto: (input) => handleObPhoto(input, state),
  onTypeChange: (key) => onTypeChange(key, state),
  openInNewTab: () => {
    const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'farbanalyse.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
});

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  onTypeChange('summer_cool', state);
  goToScreen('obWelcome');

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

  const obInput = document.getElementById('obPhotoInput');
  if (obInput) obInput.addEventListener('change', () => handleObPhoto(obInput, state));

  const rb = document.getElementById('resetBtn');
  if (rb) rb.addEventListener('click', () => {
    const g = id => document.getElementById(id);
    const fi2 = g('faceImg'); if (fi2) { fi2.style.display='none'; fi2.src=''; }
    if (g('viewActions'))      g('viewActions').style.display='none';
    if (g('palettesWrap'))     g('palettesWrap').style.display='none';
    if (g('avoidPaletteWrap')) g('avoidPaletteWrap').style.display='none';
    const uz2 = g('uploadZone'); if (uz2) uz2.style.display='flex';
    if (g('colorBg'))     g('colorBg').style.backgroundColor='#1a1f2a';
    if (g('activeLabel')) g('activeLabel').style.opacity='0';
    const fi3 = g('fileInput'); if (fi3) fi3.value='';
    Object.assign(state, { originalDataUrl:null, cutoutDataUrl:null, finalDataUrl:null, obPhotoDataUrl:null });
  });

  const eb = document.getElementById('editBtn'); if (eb) eb.addEventListener('click', openEdit);
  const cb = document.getElementById('compareBtn'); if (cb) cb.addEventListener('click', openCompare);
  const td = document.getElementById('typeDropdown');
  if (td) td.addEventListener('change', () => onTypeChange(td.value, state));
});
