/**
 * Main Entry Point — Farbanalyse App
 * Verbindet alle Module, setzt Events auf, initialisiert Router.
 */

// ── Styles ──
import './styles/fonts.css';
import './styles/base.css';
import './styles/components.css';
import './styles/modules/colorView.css';
import './styles/modules/camera.css';
import './styles/modules/crop.css';
import './styles/modules/touchup.css';
import './styles/modules/compare.css';
import './styles/modules/style.css';

// ── Modules ──
import { state, $, resetAll } from './state.js';
import { initColorView, onTypeChange } from './modules/colorView.js';
import { initUpload } from './modules/upload.js';
import { initCamera } from './modules/camera.js';
import { initCrop, applyCrop, destroyCrop } from './modules/crop.js';
import { initTouchup, applyTouchup, cleanupKeyListener, cleanupWheelListener, setTool, doUndo, resetToOriginal } from './modules/touchup.js';
import { openCompare, closeCompare, initCompare } from './modules/compare.js';
import { initAutoAnalysis, resetAutoAnalysis } from './modules/autoAnalysis.js';
import { showScreen, initScreens } from './modules/screens.js';
import { initStyleView } from './modules/styleView.js';
import { initPwa } from './modules/pwa.js';

// ══════════════════════════════════════
// EDIT MODE
// ══════════════════════════════════════

function openEdit() {
  showScreen('edit');
  switchTab('crop');
  initCrop();
}

function cancelEdit() {
  // FIX: Touchup-Key- UND Wheel-Listener auch bei Abbrechen aufräumen
  cleanupKeyListener();
  cleanupWheelListener();
  destroyCrop();
  showScreen('view');
}

function applyEdit() {
  if ($('tabCrop').classList.contains('active')) {
    applyCrop();
  } else {
    applyTouchup();
  }
}

function switchTab(tab) {
  $('tabCrop').classList.toggle('active', tab === 'crop');
  $('tabTouchup').classList.toggle('active', tab === 'touchup');
  $('cropPanel').style.display = tab === 'crop' ? 'block' : 'none';
  $('touchupPanel').style.display = tab === 'touchup' ? 'block' : 'none';
  if (tab === 'touchup') initTouchup();
}

// ══════════════════════════════════════
// RESET
// ══════════════════════════════════════

function resetView() {
  const faceImg = $('faceImg');
  if (faceImg) { faceImg.style.display = 'none'; faceImg.src = ''; }
  if ($('viewActions')) $('viewActions').style.display = 'none';
  if ($('palettesWrap')) $('palettesWrap').style.display = 'none';
  if ($('avoidPaletteWrap')) $('avoidPaletteWrap').style.display = 'none';

  const uploadZone = $('uploadZone');
  if (uploadZone) uploadZone.style.display = 'flex';

  if (state.currentSwatch) {
    state.currentSwatch.classList.remove('active');
    state.currentSwatch = null;
  }

  if ($('colorBg')) $('colorBg').style.backgroundColor = '#1a1f2a';
  if ($('activeLabel')) $('activeLabel').style.opacity = '0';

  const fileInput = $('fileInput');
  if (fileInput) fileInput.value = '';

  resetAutoAnalysis();
  resetAll();
}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════

function init() {
  // Module initialisieren
  initColorView();
  initUpload();
  initCamera();
  initCompare();
  initAutoAnalysis();
  initStyleView();
  initPwa();

  // Navigation
  document.querySelectorAll('#appNav [data-screen]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });

  // Screens inkl. Hash-Routing starten (stellt den Screen aus der URL her)
  initScreens('view');

  // Edit-Buttons
  const editBtn = $('editBtn');
  if (editBtn) editBtn.addEventListener('click', openEdit);

  const compareBtn = $('compareBtn');
  if (compareBtn) compareBtn.addEventListener('click', openCompare);

  const resetBtn = $('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetView);

  // Edit-Mode Tabs & Actions
  const tabCrop = $('tabCrop');
  const tabTouchup = $('tabTouchup');
  if (tabCrop) tabCrop.addEventListener('click', () => switchTab('crop'));
  if (tabTouchup) tabTouchup.addEventListener('click', () => switchTab('touchup'));

  // Edit actions
  const cancelEditBtn = $('cancelEditBtn');
  const applyEditBtn = $('applyEditBtn');
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);
  if (applyEditBtn) applyEditBtn.addEventListener('click', applyEdit);

  // Touchup toolbar buttons
  const btnRestore = $('btnRestore');
  const btnErase = $('btnErase');
  const btnUndo = $('btnUndo');
  const btnOriginal = $('btnOriginal');

  if (btnRestore) btnRestore.addEventListener('click', () => setTool('restore'));
  if (btnErase)   btnErase.addEventListener('click', () => setTool('erase'));
  if (btnUndo)    btnUndo.addEventListener('click', doUndo);
  if (btnOriginal) btnOriginal.addEventListener('click', resetToOriginal);

  // Compare close button
  const closeCmpBtn = $('closeCmpBtn');
  if (closeCmpBtn) closeCmpBtn.addEventListener('click', closeCompare);

  // Default Farbtyp laden
  onTypeChange('summer_cool');
}

// ── Start ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
