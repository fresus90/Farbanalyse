/**
 * Upload-Modul — Datei-Upload + Drag & Drop
 */

import { state, $ } from '../state.js';
import { removeBackground } from './bgRemoval.js';

/**
 * Zeigt das freigestellte Bild in der Stage an
 */
export function showInView(url) {
  const uploadZone = $('uploadZone');
  const procOverlay = $('procOverlay');
  const faceImg = $('faceImg');
  const viewActions = $('viewActions');
  const palettesWrap = $('palettesWrap');
  const avoidPaletteWrap = $('avoidPaletteWrap');

  if (uploadZone) uploadZone.style.display = 'none';
  if (procOverlay) procOverlay.style.display = 'none';
  if (faceImg) { faceImg.src = url; faceImg.style.display = 'block'; }
  if (viewActions) viewActions.style.display = 'flex';
  if (palettesWrap) palettesWrap.style.display = 'block';
  if (avoidPaletteWrap) avoidPaletteWrap.style.display = 'block';

  // Erste Swatch automatisch aktivieren falls keine aktiv
  if (!state.currentSwatch) {
    const first = document.querySelector('#goodSwatches .swatch');
    if (first) {
      const hex = first._hex || first.getAttribute('data-hex');
      const name = first._name || first.getAttribute('data-name');
      // Wird vom colorView-Modul via Event gehandelt
      first.click();
    }
  }
}

/**
 * Verarbeitet eine hochgeladene Datei
 */
export function handleFile(file) {
  const uploadZone = $('uploadZone');
  const procOverlay = $('procOverlay');

  if (uploadZone) uploadZone.style.display = 'none';
  if (procOverlay) procOverlay.style.display = 'flex';

  const reader = new FileReader();
  reader.onload = (e) => {
    state.originalDataUrl = e.target.result;

    const skipCheckbox = $('skipBgRemoval');
    if (skipCheckbox && skipCheckbox.checked) {
      state.cutoutDataUrl = state.originalDataUrl;
      state.finalDataUrl = state.originalDataUrl;
      showInView(state.finalDataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const workCanvas = $('workCanvas');
      removeBackground(img, workCanvas).then((url) => {
        state.cutoutDataUrl = url;
        state.finalDataUrl = url;
        showInView(url);
      }).catch((err) => {
        console.error('Hintergrund-Entfernung fehlgeschlagen:', err);
        // Fallback: Originalbild verwenden
        state.cutoutDataUrl = state.originalDataUrl;
        state.finalDataUrl = state.originalDataUrl;
        showInView(state.originalDataUrl);
      });
    };
    img.src = state.originalDataUrl;
  };

  reader.onerror = () => {
    console.error('Datei konnte nicht gelesen werden');
    if (uploadZone) uploadZone.style.display = 'flex';
    if (procOverlay) procOverlay.style.display = 'none';
  };

  reader.readAsDataURL(file);
}

/**
 * Initialisiert Upload-Zone Events
 */
export function initUpload() {
  const uploadZone = $('uploadZone');
  const fileInput = $('fileInput');

  if (uploadZone) {
    uploadZone.addEventListener('click', (e) => {
      // Checkbox nicht triggern
      if (e.target.id === 'skipBgRemoval' || e.target.htmlFor === 'skipBgRemoval') return;
      // Camera-Guide öffnen (wird vom main.js importiert)
      document.dispatchEvent(new CustomEvent('open-guide'));
    });

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleFile(file);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
  }
}
