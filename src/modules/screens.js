/**
 * screens.js — ein einziger Ort, an dem zwischen View / Edit / Compare
 * umgeschaltet wird.
 *
 * Vorher schaltete jedes Modul die Screens selbst um (main.js, crop.js,
 * touchup.js, compare.js setzen alle direkt style.display auf #viewMode und
 * #editMode). Dabei blieben #typeSelectorWrap und #typeCard immer sichtbar —
 * sie liegen in index.html ausserhalb von #viewMode und wurden nirgends
 * versteckt, standen also auch im Edit- und Vergleichsmodus noch unter der
 * Seite. Die Zusatzelemente haengen jetzt am View-Screen.
 *
 * Hinweis: src/router.js macht etwas Aehnliches ueber den URL-Hash, wird aber
 * von niemandem importiert. Wer Deep-Links und Browser-Zurueck will, sollte
 * screens.js durch den Router ersetzen statt beides parallel zu fahren.
 */

import { $ } from '../state.js';

// Zusatzelemente, die zum View-Screen gehoeren, aber ausserhalb liegen
const VIEW_CHROME = ['analysisBanner', 'typeSelectorWrap', 'typeCard'];

const SCREENS = {
  view:    { id: 'viewMode',    display: 'block' },
  edit:    { id: 'editMode',    display: 'block' },
  compare: { id: 'compareMode', display: 'block' }
};

let current = null;

export function showScreen(name) {
  const target = SCREENS[name];
  if (!target) return;

  for (const [key, cfg] of Object.entries(SCREENS)) {
    const el = $(cfg.id);
    if (el) el.style.display = key === name ? cfg.display : 'none';
  }

  for (const id of VIEW_CHROME) {
    const el = $(id);
    if (!el) continue;
    if (name !== 'view') {
      el.style.display = 'none';
    } else if (id === 'analysisBanner') {
      // Der Banner hat einen eigenen Sichtbarkeitszustand (leer / ausgeblendet)
      // und wird beim Zurueckkehren nicht ungefragt wieder eingeblendet.
      el.style.display = el.dataset.visible === '1' ? 'flex' : 'none';
    } else {
      el.style.display = id === 'typeCard' ? 'flex' : 'block';
    }
  }

  current = name;
}

export function currentScreen() { return current; }
