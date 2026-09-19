import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Basis-Pfad:
 *   Lokal und auf Cloudflare Pages bleibt es "/". Für eine Auslieferung unter
 *   einem Unterpfad (z. B. GitHub Project Pages) BASE_PATH setzen — alle
 *   Laufzeit-Pfade (WASM, Modell) nutzen import.meta.env.BASE_URL.
 */
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  root: '.',
  publicDir: 'public',

  plugins: [
    VitePWA({
      // Kein automatisches Neuladen: Ein Reload mitten in einer Analyse oder im
      // Freistell-Editor würde Foto, Crop und Retusche verwerfen. Der Nutzer
      // entscheidet, wann aktualisiert wird.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon.svg', 'icons/apple-touch-icon.png'],

      manifest: {
        name: 'Persönliche Farbanalyse',
        short_name: 'Farbanalyse',
        description: 'Finde deinen saisonalen Farbtyp und entdecke, welche Farben dir stehen – vollständig auf dem Gerät, ohne Upload.',
        lang: 'de',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1117',
        theme_color: '#0f1117',
        categories: ['lifestyle', 'shopping', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },

      workbox: {
        // App-Shell wird vorab gecacht. Modell (~3,8 MB) und WASM-Laufzeit
        // (~22 MB) bewusst nicht: Sie würden die Erstinstallation aufblähen,
        // auch wenn nie eine Analyse läuft. Sie landen beim ersten Gebrauch im
        // Laufzeit-Cache – oder vorab über "Offline vorbereiten".
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        globIgnores: ['models/**', 'mediapipe/**'],
        navigateFallback: 'index.html',
        // debug.html ist eine eigene Seite und darf nicht durch index.html
        // ersetzt werden.
        navigateFallbackDenylist: [/^\/debug/],
        cleanupOutdatedCaches: true,
        // Die WASM-Laufzeit ist einzeln über 11 MB groß — der Standard von 2 MB
        // gilt zwar nur fürs Precaching, das Limit wird hier aber auch für die
        // Laufzeit-Antworten angehoben.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // clientsClaim: Der Service Worker übernimmt die bereits offene Seite
        // sofort nach der Installation – sonst liefen die Anfragen des ersten
        // Besuchs an ihm vorbei und Modell wie Laufzeit landeten nie im Cache.
        clientsClaim: true,
        // skipWaiting bleibt aus: Ein Update wird erst nach Bestätigung aktiv
        // (siehe registerType 'prompt'), damit keine laufende Bearbeitung verloren geht.
        skipWaiting: false,
        runtimeCaching: [
          {
            // FIX: die Regel griff nur fuer .task — das Segmentierungs-Modell
            // ist eine .tflite-Datei und waere offline nicht verfuegbar gewesen.
            urlPattern: ({ url }) => url.pathname.includes('/models/')
              && (url.pathname.endsWith('.task') || url.pathname.endsWith('.tflite')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mediapipe-models-v1',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/mediapipe/wasm/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mediapipe-wasm-v1',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },

      devOptions: {
        // Im Dev-Server stört ein Service Worker mehr als er hilft.
        enabled: false
      }
    })
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        debug: resolve(__dirname, 'debug.html')
      }
    }
  },

  server: {
    port: 3000,
    host: true
  },
  preview: {
    port: 4173,
    host: true
  }
});
