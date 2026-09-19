/**
 * Live-Hilfe im Kamerabild.
 *
 * Misst den Sucherstrom laufend und sagt, was zu ändern ist, bevor ausgelöst
 * wird. Die nachträgliche Qualitätsprüfung der Analyse bleibt bestehen — aber
 * einen Hinweis nach der Aufnahme kann man nicht mehr befolgen, ohne das Foto
 * zu wiederholen.
 *
 * Läuft absichtlich gedrosselt: Der Landmarker im VIDEO-Modus kostet auf einem
 * Telefon Rechenzeit, und für Rückmeldung an einen Menschen reichen ein paar
 * Bilder pro Sekunde.
 */

import { state, $ } from '../state.js';
import { ensureFaceTracker, detectInVideo } from '../core/faceTracker.js';
import { measureFrame } from '../core/frameQuality.js';

/** Mindestabstand zwischen zwei Messungen. */
const INTERVAL_MS = 160;
/** Längste Kante des Analysebildes — mehr bringt für diese Maße nichts. */
const SAMPLE_EDGE = 320;

const ICONS = { ok: '✓', warn: '!', bad: '✕' };

let running = false;
let rafId = null;
let lastRun = 0;
let canvas = null;
let ctx = null;
let lastSignature = '';
let unavailable = false;

export function startCameraGuide() {
  if (running) return;
  running = true;
  unavailable = false;
  lastSignature = '';
  setPanelState('loading', 'Kamerahilfe wird vorbereitet …');

  ensureFaceTracker()
    .then(() => {
      // Nur dann etwas anzeigen, wenn die Messschleife noch nichts geschrieben
      // hat: Das Modell kann fertig laden, nachdem bereits das erste Bild
      // bewertet wurde — dann darf der Ladehinweis das Ergebnis nicht wieder
      // ueberschreiben.
      if (running && $('camGuidePanel')?.dataset.state === 'loading') {
        setPanelState('active', 'Bild wird geprüft …');
      }
    })
    .catch((err) => {
      console.warn('Kamerahilfe nicht verfügbar:', err.message);
      unavailable = true;
      setPanelState('off', 'Live-Hilfe nicht verfügbar — bitte auf die Foto-Tipps achten.');
    });

  rafId = requestAnimationFrame(tick);
}

export function stopCameraGuide() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  setOvalState('idle');
}

function tick(now) {
  if (!running) return;
  rafId = requestAnimationFrame(tick);
  if (unavailable || now - lastRun < INTERVAL_MS) return;
  lastRun = now;

  const video = $('camVideo');
  if (!video || video.readyState < 2 || !video.videoWidth) return;

  try {
    const { pixels, W, H } = grabFrame(video);
    const landmarks = detectInVideo(video, now);
    render(measureFrame({ landmarks, pixels, W, H, mirrored: state.camFacing === 'user' }));
  } catch (err) {
    // Einzelne Aussetzer (Kamerawechsel, Tab im Hintergrund) sind kein Grund,
    // die Schleife zu beenden.
    console.debug('Kamerahilfe: Bild übersprungen', err?.message);
  }
}

function grabFrame(video) {
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const W = Math.max(2, Math.round(video.videoWidth * scale));
  const H = Math.max(2, Math.round(video.videoHeight * scale));
  if (!canvas) {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.drawImage(video, 0, 0, W, H);
  return { pixels: ctx.getImageData(0, 0, W, H).data, W, H };
}

// ══════════════════════════════════════
// Anzeige
// ══════════════════════════════════════

function render({ checks, ready }) {
  // Nur neu zeichnen, wenn sich etwas geändert hat — sonst flackert die Liste
  // bei jedem Bild und ist nicht lesbar.
  const signature = checks.map((c) => c.id + c.state + (c.value ?? '')).join('|');
  if (signature === lastSignature) return;
  lastSignature = signature;

  const list = $('camChecks');
  if (list) {
    // Zu beheben zuerst, Erledigtes danach: Vor der Kamera zählt, was noch fehlt.
    const order = { bad: 0, warn: 1, ok: 2 };
    const sorted = [...checks].sort((a, b) => order[a.state] - order[b.state]);
    list.innerHTML = sorted.map((c) => `
      <li class="cam-check" data-state="${c.state}">
        <span class="cam-check-icon">${ICONS[c.state]}</span>
        <span class="cam-check-body">
          <span class="cam-check-label">${esc(c.label)}${c.value ? ` <em>${esc(c.value)}</em>` : ''}</span>
          <span class="cam-check-hint">${esc(c.hint)}</span>
        </span>
      </li>`).join('');
  }

  const open = checks.filter((c) => c.state !== 'ok').length;
  setPanelState(ready ? 'ready' : 'active',
    ready ? 'Bereit für die Aufnahme' : `${open} ${open === 1 ? 'Punkt' : 'Punkte'} anpassen`);

  setOvalState(ready ? 'ready' : checks.some((c) => c.state === 'bad') ? 'bad' : 'warn');

  const shutter = $('camShutterBtn');
  if (shutter) shutter.classList.toggle('ready', ready);
}

function setPanelState(state, text) {
  const panel = $('camGuidePanel');
  if (panel) panel.dataset.state = state;
  const summary = $('camGuideSummary');
  if (summary) summary.textContent = text;
}

/** Färbt das Positionierungs-Oval nach dem Gesamtzustand. */
function setOvalState(state) {
  const oval = $('camOvalGuide');
  if (oval) oval.setAttribute('data-state', state);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
