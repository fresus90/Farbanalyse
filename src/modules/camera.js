/**
 * Camera-Modul — Live-Kamera + Guide-Modal
 */

import { state, $ } from '../state.js';
import { handleFile } from './upload.js';

/**
 * Guide-Modal öffnen/schließen
 */
export function openGuide() {
  const g = $('cameraGuide');
  if (g) g.classList.add('open');
}

export function closeGuide() {
  const g = $('cameraGuide');
  if (g) g.classList.remove('open');
}

export function confirmGuide() {
  closeGuide();
  const fi = $('fileInput');
  if (fi) fi.click();
}

/**
 * Live-Kamera starten
 */
export function openLiveCamera() {
  closeGuide();
  const m = $('liveCameraModal');
  if (m) m.classList.add('open');
  startStream();
}

export function closeLiveCamera() {
  if (state.camStream) {
    state.camStream.getTracks().forEach(t => t.stop());
    state.camStream = null;
  }
  const m = $('liveCameraModal');
  if (m) m.classList.remove('open');
  const v = $('camVideo');
  if (v) v.srcObject = null;
}

export function flipCamera() {
  state.camFacing = state.camFacing === 'user' ? 'environment' : 'user';
  startStream();
}

function startStream() {
  if (state.camStream) {
    state.camStream.getTracks().forEach(t => t.stop());
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCameraError('Kamerazugriff nicht unterstützt. Bitte lade die Datei lokal im Browser.');
    return;
  }

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: state.camFacing, width: { ideal: 1280 }, height: { ideal: 1280 } },
    audio: false
  })
  .then(stream => {
    state.camStream = stream;
    const v = $('camVideo');
    if (v) {
      v.srcObject = stream;
      v.classList.toggle('mirror', state.camFacing === 'user');
    }
  })
  .catch(err => {
    closeLiveCamera();
    showCameraError('Kamerazugriff verweigert: ' + err.message);
  });
}

/**
 * Foto aufnehmen (FIX: war vorher captureObPhoto, fehlte)
 */
export function capturePhoto() {
  const video = $('camVideo');
  const wc = $('workCanvas');
  if (!video || !wc) return;

  wc.width = video.videoWidth;
  wc.height = video.videoHeight;
  const ctx = wc.getContext('2d');

  if (state.camFacing === 'user') {
    ctx.translate(wc.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);

  const url = wc.toDataURL('image/jpeg', 0.92);
  closeLiveCamera();

  fetch(url)
    .then(r => r.blob())
    .then(b => handleFile(new File([b], 'camera.jpg', { type: 'image/jpeg' })));
}

/**
 * Kamera-Fehlermeldung anzeigen
 */
function showCameraError(msg) {
  openGuide();
  const actions = document.querySelector('.guide-actions');
  let e = $('camErrorMsg');

  if (!e) {
    e = document.createElement('div');
    e.id = 'camErrorMsg';
    e.style.cssText = 'padding:0 20px 12px;';
    if (actions && actions.parentNode) {
      actions.parentNode.insertBefore(e, actions);
    }
  }

  e.innerHTML =
    `<p style="font-size:.68rem;color:#c07878;line-height:1.5;margin-bottom:10px;">⚠️ ${msg}</p>` +
    `<button id="downloadFallbackBtn" style="width:100%;padding:10px;border-radius:8px;background:linear-gradient(135deg,#4a7fa5,#3a6a90);border:none;color:#fff;font-family:sans-serif;font-size:.76rem;cursor:pointer;">⬇️ App herunterladen & lokal öffnen</button>`;

  const btn = $('downloadFallbackBtn');
  if (btn) btn.addEventListener('click', downloadAsHtml);
}

function downloadAsHtml() {
  const src = document.documentElement.outerHTML;
  const blob = new Blob([src], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'farbanalyse.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Initialisiert Camera-Events
 */
export function initCamera() {
  // Guide-Öffnen via Custom Event (von upload.js getriggert)
  document.addEventListener('open-guide', openGuide);

  // Guide-Buttons
  const closeBtn = $('guideCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeGuide);

  const guideCameraBtn = $('guideCameraBtn');
  if (guideCameraBtn) guideCameraBtn.addEventListener('click', openLiveCamera);

  const guideFileBtn = $('guideFileBtn');
  if (guideFileBtn) guideFileBtn.addEventListener('click', confirmGuide);

  const guideCancelBtn = $('guideCancelBtn');
  if (guideCancelBtn) guideCancelBtn.addEventListener('click', closeGuide);

  // Live-Kamera Buttons
  const flipBtn = $('camFlipBtn');
  if (flipBtn) flipBtn.addEventListener('click', flipCamera);

  const shutterBtn = $('camShutterBtn');
  if (shutterBtn) shutterBtn.addEventListener('click', capturePhoto);

  const cancelBtn = $('camCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeLiveCamera);
}
