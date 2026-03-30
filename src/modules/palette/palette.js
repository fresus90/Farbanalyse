import { COLOR_TYPES } from '../../data/colorTypes.js';

export let currentSwatch = null;
let labelTimer = null;

export function onTypeChange(key, state) {
  if (!key || !COLOR_TYPES[key]) return;
  if (state) state.activeTypeKey = key;
  const t = COLOR_TYPES[key];
  const s = id => document.getElementById(id);
  if (s('typeIcon'))    s('typeIcon').style.background = t.gradient;
  if (s('typeLabel'))   s('typeLabel').textContent = t.season;
  if (s('typeName'))    s('typeName').textContent = t.name;
  if (s('typeDesc'))    s('typeDesc').textContent = t.desc;
  rebuildSwatches(t);
  currentSwatch = null;
  if (s('colorBg'))     s('colorBg').style.backgroundColor = '#1a1f2a';
  if (s('activeLabel')) s('activeLabel').style.opacity = '0';
  const dd = s('typeDropdown');
  if (dd && dd.value !== key) dd.value = key;
}

export function rebuildSwatches(t) {
  buildSwatches(t.good, 'goodSwatches');
  buildSwatches(t.avoid, 'avoidSwatches');
}

export function buildSwatches(list, id) {
  const c = document.getElementById(id);
  if (!c) return;
  c.innerHTML = '';
  list.forEach(item => {
    const d = document.createElement('div');
    d.className = 'swatch';
    d._hex = item.hex; d._name = item.name;
    d.innerHTML = '<div class="swatch-color" style="background:' + item.hex + '"></div>'
      + '<div class="swatch-name">' + item.name + '</div>';
    d.addEventListener('click', () => setBackground(item.hex, item.name, d));
    c.appendChild(d);
  });
}

export function setBackground(hex, name, el) {
  const bg = document.getElementById('colorBg');
  if (bg) bg.style.backgroundColor = hex;
  if (currentSwatch) currentSwatch.classList.remove('active');
  if (el) { el.classList.add('active'); currentSwatch = el; }
  const lbl = document.getElementById('activeLabel');
  if (lbl) { lbl.textContent = name; lbl.style.opacity = '1'; }
  clearTimeout(labelTimer);
  labelTimer = setTimeout(() => { if (lbl) lbl.style.opacity = '0'; }, 2000);
}
