/**
 * Einfacher Hash-Router für Screen-Navigation.
 * Screens werden über #view, #edit, #compare etc. gesteuert.
 *
 * Usage:
 *   import { router } from './router.js';
 *   router.register('view', { show() {...}, hide() {...} });
 *   router.navigate('view');
 */

const screens = new Map();
let currentScreen = null;

export const router = {
  /**
   * Registriere einen Screen mit show/hide Callbacks
   */
  register(name, { show = () => {}, hide = () => {} }) {
    screens.set(name, { show, hide });
  },

  /**
   * Navigiere zu einem Screen
   */
  navigate(name, pushState = true) {
    if (currentScreen && screens.has(currentScreen)) {
      screens.get(currentScreen).hide();
    }
    if (screens.has(name)) {
      screens.get(name).show();
    }
    currentScreen = name;
    if (pushState) {
      window.location.hash = name;
    }
  },

  /**
   * Aktuellen Screen-Namen abfragen
   */
  get current() {
    return currentScreen;
  },

  /**
   * Hash-Listener starten (für Browser-Zurück-Button)
   */
  init(defaultScreen = 'view') {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || defaultScreen;
      if (screens.has(hash)) {
        this.navigate(hash, false);
      }
    });

    // Initialer Screen
    const initial = window.location.hash.slice(1) || defaultScreen;
    this.navigate(screens.has(initial) ? initial : defaultScreen, false);
  }
};
