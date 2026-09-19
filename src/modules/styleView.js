/**
 * styleView.js — Stilberatung (Phase 2).
 *
 * Verbindet drei Ebenen zu einer konkreten Kaufempfehlung:
 *   1. Farbtyp  — kommt aus Phase 1 (Analyse oder Dropdown)
 *   2. Stilrichtung — wählt die Nutzerin/der Nutzer selbst; Geschmack lässt
 *      sich nicht aus einem Foto ableiten
 *   3. Körperform — aus vier Maßen bestimmt (src/core/bodyShape.js)
 *
 * Die Stilkarten zeigen jeden Stil in der EIGENEN Palette statt an einem
 * fremden Model: Silhouetten aus src/data/garments.js, eingefärbt mit den
 * Basis- und Akzentfarben des aktiven Farbtyps.
 */

import { state, $ } from '../state.js';
import { colorTypes } from './colorView.js';
import { GARMENTS, garmentSvg, garmentLabel } from '../data/garments.js';
import { splitPalette, shade, readableOn } from '../core/palette.js';
import { classifyBodyShape } from '../core/bodyShape.js';
import { loadPreferences, savePreferences } from '../storage/preferences.js';
import styleTypes from '../data/styleTypes.json';
import bodyShapes from '../data/bodyShapes.json';

const MEASUREMENT_FIELDS = [
  ['schulter', 'Schulter', 'Über die breiteste Stelle der Schultern'],
  ['bueste',   'Büste',    'Über die stärkste Stelle der Brust'],
  ['taille',   'Taille',   'An der schmalsten Stelle, nicht einziehen'],
  ['huefte',   'Hüfte',    'Über die stärkste Stelle von Po und Hüfte']
];

let prefs = { styleKey: null, bodyShapeKey: null, measurements: null };

/** Kleines HTML-Escaping — alle Texte kommen zwar aus eigenen JSON-Dateien,
 *  aber sie landen über innerHTML im DOM und sollen das auch bleiben dürfen. */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function activeType() {
  return colorTypes[state.activeTypeKey] ?? Object.values(colorTypes)[0];
}

/** Basis- und Akzentfarben für den aktiven Farbtyp unter einem Stil. */
function paletteFor(styleKey) {
  const style = styleTypes[styleKey];
  const type = activeType();
  return splitPalette(type.good, {
    baseCount: style?.baseCount ?? 3,
    accentCount: style?.accentCount ?? 2,
    contrastFirst: styleKey === 'dramatisch'
  });
}

/**
 * Verteilt Basis- und Akzentfarben auf eine Reihe von Kleidungsstücken.
 *
 * Akzente gehören nach oben, ans Gesicht — dort wirkt die Farbe auf den Teint.
 * Die erste Fassung färbte stur jedes dritte Teil im Akzent, und weil die
 * meisten Stile ihre Oberteile zuerst listen, landete der kräftigste Ton
 * regelmäßig auf der Hose. Große und tragende Teile (Hosen, Röcke, Mäntel,
 * Kleider) bekommen jetzt die Basisfarben, Oberteile und Accessoires den Akzent.
 */
const ACCENT_CATEGORIES = new Set(['oberteil', 'accessoire']);

function assignColors(pieces, { base, accent }) {
  const fallback = base[0] ?? accent[0] ?? { hex: '#4a7fa5', name: '' };
  let accentUsed = 0;
  let baseUsed = 0;

  return pieces.map((key) => {
    const category = GARMENTS[key]?.category;
    const takesAccent = ACCENT_CATEGORIES.has(category) && accentUsed < accent.length;
    const color = takesAccent
      ? accent[accentUsed++]
      : (base[baseUsed++ % Math.max(1, base.length)] ?? fallback);
    return { key, color: color ?? fallback };
  });
}

/** SVG eines Kleidungsstücks in einer Palettenfarbe. */
function pieceSvg(key, color) {
  return garmentSvg(key, {
    body: color.hex,
    trim: shade(color.hex, -12),
    line: shade(color.hex, 22)
  }, { title: `${garmentLabel(key)} in ${color.name ?? ''}` });
}

// ══════════════════════════════════════
// Stil-Galerie
// ══════════════════════════════════════

function renderGallery() {
  const grid = $('styleGrid');
  if (!grid) return;

  grid.innerHTML = Object.entries(styleTypes).map(([key, style]) => {
    // Drei Schlüsselteile als Mini-Outfit in den Farben dieser Person.
    const pieces = assignColors(style.keyPieces.slice(0, 3), paletteFor(key))
      .map(({ key: g, color }) => pieceSvg(g, color)).join('');

    return `
      <button class="style-card${key === prefs.styleKey ? ' active' : ''}" data-style="${key}" type="button">
        <div class="style-card-figures">${pieces}</div>
        <div class="style-card-name">${esc(style.name)}</div>
        <div class="style-card-tagline">${esc(style.tagline)}</div>
      </button>`;
  }).join('');

  grid.querySelectorAll('[data-style]').forEach((btn) => {
    btn.addEventListener('click', () => selectStyle(btn.dataset.style));
  });
}

function selectStyle(key) {
  if (!styleTypes[key]) return;
  prefs.styleKey = key;
  savePreferences(prefs);
  renderGallery();
  renderStyleDetail();
  renderRecommendation();
  $('styleDetailWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ══════════════════════════════════════
// Stil-Detail
// ══════════════════════════════════════

function list(title, items) {
  if (!items?.length) return '';
  return `<div class="detail-block">
    <div class="detail-label">${esc(title)}</div>
    <div class="chips">${items.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>
  </div>`;
}

function renderStyleDetail() {
  const wrap = $('styleDetailWrap');
  const el = $('styleDetail');
  if (!wrap || !el) return;

  const style = styleTypes[prefs.styleKey];
  if (!style) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const { base, accent } = paletteFor(prefs.styleKey);
  const swatch = (c) => `<span class="mini-swatch" style="background:${c.hex};color:${readableOn(c.hex)}">${esc(c.name)}</span>`;

  el.innerHTML = `
    <div class="detail-head">
      <h3>${esc(style.name)}</h3>
      <p class="detail-desc">${esc(style.desc)}</p>
      <p class="detail-sil"><strong>Silhouette:</strong> ${esc(style.silhouette)}</p>
    </div>
    <div class="detail-block">
      <div class="detail-label">Deine Schlüsselteile</div>
      <div class="piece-row">
        ${assignColors(style.keyPieces, { base, accent }).map(({ key: g, color }) => `
          <figure class="piece">
            ${pieceSvg(g, color)}
            <figcaption>${esc(garmentLabel(g))}</figcaption>
          </figure>`).join('')}
      </div>
    </div>
    <div class="detail-block">
      <div class="detail-label">Farbstrategie</div>
      <p class="detail-desc">${esc(style.colorStrategy)}</p>
      <div class="swatch-line"><span class="swatch-line-label">Basis</span>${base.map(swatch).join('')}</div>
      <div class="swatch-line"><span class="swatch-line-label">Akzent</span>${accent.map(swatch).join('')}</div>
    </div>
    ${list('Materialien', style.fabrics)}
    ${list('Muster', style.patterns)}
    ${list('Details', style.details)}
    ${list('Accessoires', style.accessories)}
    ${list('Passt nicht zum Stil', style.avoid)}
  `;
}

// ══════════════════════════════════════
// Körperform
// ══════════════════════════════════════

function renderShapePicker() {
  const picker = $('shapePicker');
  if (!picker) return;
  picker.innerHTML = Object.entries(bodyShapes).map(([key, s]) => `
    <button class="shape-chip${key === prefs.bodyShapeKey ? ' active' : ''}" data-shape="${key}" type="button">
      <span class="shape-letter">${esc(s.letter)}</span>
      <span>${esc(s.name)}</span>
    </button>`).join('');
  picker.querySelectorAll('[data-shape]').forEach((btn) => {
    btn.addEventListener('click', () => setShape(btn.dataset.shape, null));
  });
}

function setShape(key, result) {
  prefs.bodyShapeKey = bodyShapes[key] ? key : null;
  savePreferences(prefs);
  renderShapePicker();
  renderShapeResult(result);
  renderRecommendation();
}

function renderShapeResult(result) {
  const el = $('shapeResult');
  if (!el) return;

  if (result?.error) {
    el.dataset.state = 'error';
    el.innerHTML = `<p>${esc(result.error)}</p>`;
    return;
  }
  const shape = bodyShapes[prefs.bodyShapeKey];
  if (!shape) { el.dataset.state = 'empty'; el.innerHTML = ''; return; }

  const sicher = result
    ? (result.confidence >= 60 ? 'eindeutig'
      : result.confidence >= 30 ? 'recht eindeutig'
      : 'nah an einer Grenze — sieh dir die Nachbarform auch an')
    : null;

  el.dataset.state = 'ok';
  el.innerHTML = `
    <div class="shape-result-head">
      <span class="shape-letter big">${esc(shape.letter)}</span>
      <div>
        <strong>${esc(shape.name)}</strong>
        <p>${esc(shape.desc)}</p>
        ${sicher ? `<p class="hint">Einstufung ${esc(sicher)} (${result.confidence} %).</p>` : ''}
      </div>
    </div>
    ${result?.reasons?.length ? `<ul class="reasons">${result.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}`;
}

function calculateShape() {
  const measurements = {};
  for (const [key] of MEASUREMENT_FIELDS) {
    const input = $('m_' + key);
    measurements[key] = input ? parseFloat(input.value.replace(',', '.')) : NaN;
  }
  const result = classifyBodyShape(measurements);
  if (result.error) { renderShapeResult(result); return; }

  prefs.measurements = measurements;
  setShape(result.key, result);
}

function fillMeasurements() {
  if (!prefs.measurements) return;
  for (const [key] of MEASUREMENT_FIELDS) {
    const input = $('m_' + key);
    if (input && Number.isFinite(prefs.measurements[key])) input.value = prefs.measurements[key];
  }
}

// ══════════════════════════════════════
// Zusammengeführte Empfehlung
// ══════════════════════════════════════

function renderRecommendation() {
  const wrap = $('recommendationWrap');
  const el = $('recommendation');
  if (!wrap || !el) return;

  const style = styleTypes[prefs.styleKey];
  const shape = bodyShapes[prefs.bodyShapeKey];
  if (!style) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const type = activeType();
  const { base, accent, darkest, hasDarkAnchor } = paletteFor(prefs.styleKey);
  const swatch = (c) => `<span class="mini-swatch" style="background:${c.hex};color:${readableOn(c.hex)}">${esc(c.name)}</span>`;

  // Helle Farbtypen haben keinen dunklen Anker — das ist eine Eigenschaft des
  // Typs, kein Fehler, und beim Einkaufen die wichtigste Einzelinformation.
  // Winter-Typen tragen dagegen echtes Schwarz; dort wäre "Ersatz für Schwarz"
  // Unsinn.
  const anchorNote = !hasDarkAnchor
    ? `<p class="hint">Deine Palette hat keinen dunklen Anker — bei hellen Farbtypen ist das
       normal. Nimm <strong>${esc(darkest?.name ?? '')}</strong> als dunkelsten Ton statt Schwarz;
       harte Dunkeltöne würden den Teint beschweren.</p>`
    : darkest.L < 15
    ? `<p class="hint">Deine Palette trägt echtes Schwarz: <strong>${esc(darkest.name)}</strong>
       ist dein Anker für Hosen, Mäntel und Taschen.</p>`
    : `<p class="hint">Dunkelster Ton: <strong>${esc(darkest.name)}</strong> — dein Anker für
       Hosen, Mäntel und Taschen, an der Stelle, an der andere zu Schwarz greifen.</p>`;

  const cuts = shape ? `
    <div class="detail-block">
      <div class="detail-label">Schnitte für deine ${esc(shape.name)}-Form</div>
      <p class="detail-desc">${esc(shape.goal)}</p>
      ${Object.entries(shape.recommend).map(([group, items]) => `
        <div class="rec-row">
          <span class="rec-group">${esc(group[0].toUpperCase() + group.slice(1))}</span>
          <span class="chips">${items.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</span>
        </div>`).join('')}
    </div>` : `
    <div class="detail-block">
      <p class="hint">Trage oben deine Maße ein oder wähle eine Form — dann kommen
      hier die passenden Schnitte dazu.</p>
    </div>`;

  // Was zu meiden ist, kommt aus drei Quellen: Farbtyp, Stil, Körperform.
  const avoidColors = type.avoid.slice(0, 4);

  el.innerHTML = `
    <p class="detail-desc">
      ${esc(type.name)} · ${esc(style.name)}${shape ? ' · ' + esc(shape.name) : ''}
    </p>

    <div class="detail-block">
      <div class="detail-label">Deine Basis — damit füllst du den Schrank</div>
      <div class="swatch-line">${base.map(swatch).join('')}</div>
      <p class="hint">${esc(style.colorStrategy)}</p>
      ${anchorNote}
    </div>

    <div class="detail-block">
      <div class="detail-label">Deine Akzente — davon reicht wenig</div>
      <div class="swatch-line">${accent.map(swatch).join('')}</div>
    </div>

    ${cuts}

    <div class="detail-block">
      <div class="detail-label">Materialien &amp; Muster</div>
      <div class="chips">${[...style.fabrics, ...style.patterns].map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>
    </div>

    <div class="detail-block avoid">
      <div class="detail-label">Zurückhaltung bei</div>
      <div class="swatch-line">${avoidColors.map(swatch).join('')}</div>
      <div class="chips">
        ${style.avoid.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}
        ${shape ? shape.avoid.map((i) => `<span class="chip">${esc(i)}</span>`).join('') : ''}
      </div>
    </div>`;
}

// ══════════════════════════════════════
// Init
// ══════════════════════════════════════

/** Neu zeichnen, wenn sich der Farbtyp geändert hat. */
export function refreshStyleView() {
  const intro = $('styleIntro');
  if (intro) {
    intro.textContent = `Deine Palette: ${activeType().name}. Wähle die Stilrichtung, `
      + 'die sich nach dir anfühlt — die Teile siehst du direkt in deinen Farben.';
  }
  renderGallery();
  renderStyleDetail();
  renderShapePicker();
  renderShapeResult(null);
  renderRecommendation();
}

export function initStyleView() {
  prefs = loadPreferences();

  const form = $('measureForm');
  if (form) {
    form.addEventListener('submit', (e) => { e.preventDefault(); calculateShape(); });
  }
  $('shapeResetBtn')?.addEventListener('click', () => {
    prefs.measurements = null;
    for (const [key] of MEASUREMENT_FIELDS) { const i = $('m_' + key); if (i) i.value = ''; }
    setShape(null, null);
  });

  fillMeasurements();
  refreshStyleView();

  // Farbtyp-Wechsel im anderen Screen schlägt auf die Stilfarben durch.
  document.addEventListener('type-changed', refreshStyleView);
}

export { MEASUREMENT_FIELDS };
