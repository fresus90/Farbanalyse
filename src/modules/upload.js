/**
 * Upload-Modul — Datei-Upload + Drag & Drop
 */

import { state, $ } from '../state.js';
import { removeBackground } from './bgRemoval.js';

/**
 * Weist darauf hin, wenn nicht das gelernte Verfahren gelaufen ist.
 *
 * Das einfache Flood-Fill scheitert an Farbverläufen, Schatten und an Haaren,
 * die farblich nah am Hintergrund liegen. Wer das Ergebnis sieht, soll wissen,
 * woran es liegt und was hilft.
 */
function showCutoutHint(method) {
  const el = $('cutoutHint');
  if (!el) return;
  if (method === 'floodfill') {
    el.textContent = 'Automatisches Freistellen war nicht möglich — es lief das '
      + 'einfache Verfahren. Bei Haaren und unruhigem Hintergrund hilft „Nachbessern".';
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

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
    if (first) first.click();
  }

  // Automatische Farbtyp-Bestimmung anstossen (autoAnalysis.js hoert darauf).
  document.dispatchEvent(new CustomEvent('photo-ready', { detail: { url } }));
}

/**
 * Setzt eine Data-URL als neues Originalbild, stellt frei und zeigt das
 * Ergebnis an.
 *
 * Aus handleFile herausgezogen, damit der Crop denselben Weg nehmen kann —
 * vorher hat applyCrop() das beschnittene Bild direkt als cutoutDataUrl
 * gesetzt, ohne erneut freizustellen, wodurch der Hintergrund zurueckkam.
 *
 * @returns {Promise<string>} die angezeigte Data-URL
 */
export function processDataUrl(dataUrl) {
  const uploadZone = $('uploadZone');
  const procOverlay = $('procOverlay');

  if (uploadZone) uploadZone.style.display = 'none';
  if (procOverlay) procOverlay.style.display = 'flex';

  state.originalDataUrl = dataUrl;

  const skipCheckbox = $('skipBgRemoval');
  if (skipCheckbox && skipCheckbox.checked) {
    state.cutoutDataUrl = dataUrl;
    state.finalDataUrl = dataUrl;
    state.cutoutMethod = 'none';
    state.personMask = null;
    showCutoutHint('none');
    showInView(dataUrl);
    return Promise.resolve(dataUrl);
  }

  const setProcText = (text) => {
    const el = procOverlay?.querySelector('.proc-text');
    if (el) el.textContent = text;
  };

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      removeBackground(img, $('workCanvas'), setProcText).then(({ url, method, reason, mask }) => {
        state.cutoutDataUrl = url;
        state.finalDataUrl = url;
        state.cutoutMethod = method;
        state.personMask = mask ?? null;
        if (method !== 'segmentation') console.info('Freistellen per Flood-Fill:', reason);
        showCutoutHint(method);
        showInView(url);
        resolve(url);
      }).catch((err) => {
        console.error('Hintergrund-Entfernung fehlgeschlagen:', err);
        // Fallback: Originalbild verwenden
        state.cutoutDataUrl = dataUrl;
        state.finalDataUrl = dataUrl;
        showInView(dataUrl);
        resolve(dataUrl);
      });
    };
    img.onerror = () => {
      console.error('Bild konnte nicht geladen werden');
      state.cutoutDataUrl = dataUrl;
      state.finalDataUrl = dataUrl;
      showInView(dataUrl);
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
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
  reader.onload = (e) => { processDataUrl(e.target.result); };

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
