/**
 * Dauerhafte Einstellungen (Stilrichtung, Körperform, Maße).
 *
 * localStorage kann fehlschlagen — im privaten Modus, bei blockierten
 * Website-Daten, in manchen WebViews. Jeder Zugriff ist deshalb gekapselt und
 * die App muss ohne gespeicherte Werte genauso funktionieren.
 */

const KEY = 'farbanalyse.preferences.v1';

const DEFAULTS = {
  styleKey: null,
  bodyShapeKey: null,
  measurements: null   // { schulter, bueste, taille, huefte }
};

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePreferences(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...DEFAULTS, ...prefs }));
    return true;
  } catch {
    return false;   // kein Grund, die App anzuhalten
  }
}

export function clearPreferences() {
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
}
