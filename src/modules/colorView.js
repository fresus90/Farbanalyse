/**
 * ColorView-Modul — Swatches, Type-Selector, Farbvorschau
 */

import { state, $ } from '../state.js';
import colorTypes from '../data/colorTypes.json';

export { colorTypes };

/**
 * Wechselt den aktiven Farbtyp
 */
export function onTypeChange(key) {
  if (!key || !colorTypes[key]) return;
  state.activeTypeKey = key;

  const t = colorTypes[key];
  const typeIcon = $('typeIcon');
  const typeLabel = $('typeLabel');
  const typeName = $('typeName');
  const typeDesc = $('typeDesc');

  if (typeIcon)  typeIcon.style.background = t.gradient;
  if (typeLabel) typeLabel.textContent = t.season;
  if (typeName)  typeName.textContent = t.name;
  if (typeDesc)  typeDesc.textContent = t.desc;

  rebuildSwatches(t);

  state.currentSwatch = null;
  const colorBg = $('colorBg');
  const activeLabel = $('activeLabel');
  if (colorBg) colorBg.style.backgroundColor = '#1a1f2a';
  if (activeLabel) activeLabel.style.opacity = '0';

  const dd = $('typeDropdown');
  if (dd && dd.value !== key) dd.value = key;
}

/**
 * Baut Good- und Avoid-Swatches neu auf
 */
function rebuildSwatches(type) {
  buildSwatches(type.good, 'goodSwatches');
  buildSwatches(type.avoid, 'avoidSwatches');
}

function buildSwatches(list, containerId) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';

  list.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'swatch';
    div._hex = item.hex;
    div._name = item.name;
    div.innerHTML =
      `<div class="swatch-color" style="background:${item.hex}"></div>` +
      `<div class="swatch-name">${item.name}</div>`;

    div.addEventListener('click', () => {
      setBackground(item.hex, item.name, div);
    });

    container.appendChild(div);
  });
}

/**
 * Setzt den Hintergrund der Stage auf eine Farbe
 */
export function setBackground(hex, name, el) {
  const bg = $('colorBg');
  if (bg) bg.style.backgroundColor = hex;

  if (state.currentSwatch) state.currentSwatch.classList.remove('active');
  if (el) { el.classList.add('active'); state.currentSwatch = el; }

  const lbl = $('activeLabel');
  if (lbl) { lbl.textContent = name; lbl.style.opacity = '1'; }

  clearTimeout(state.labelTimer);
  state.labelTimer = setTimeout(() => {
    if (lbl) lbl.style.opacity = '0';
  }, 2000);
}

/**
 * Initialisiert den Type-Selector Dropdown
 */
export function initColorView() {
  const dropdown = $('typeDropdown');
  if (dropdown) {
    dropdown.addEventListener('change', () => onTypeChange(dropdown.value));
  }

  // Initial laden
  onTypeChange(state.activeTypeKey);
}
