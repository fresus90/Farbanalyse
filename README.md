# Farbanalyse

Persönliche Farbanalyse-App — Finde deinen saisonalen Farbtyp und entdecke, welche Farben dir am besten stehen.

## Features

- **12 Farbtypen** — Frühling, Sommer, Herbst, Winter (je 3 Untertypen)
- **Automatische Farbtyp-Bestimmung** — MediaPipe Face Landmarker, Lab-Clustering
  von Haut/Haar/Iris, Sklera-Weißabgleich, 7-dimensionales Typ-Matching
- **Foto-Upload & Kamera** — Live-Kamera mit Gesichts-Guide oder Datei-Upload
- **Hintergrund-Entfernung** — Client-seitiges Freistellen per Canvas
- **Crop & Touch-Up** — Bildausschnitt anpassen, Freistellen nachbessern
- **Farbvergleich** — Zwei Farbtypen nebeneinander vergleichen (Split-Screen)
- **Responsive** — Optimiert für Mobile und Desktop
- **PWA** — installierbar, offline nutzbar, keine Drittanbieter-Requests

## Tech-Stack

- Vanilla JS (ES Modules)
- Vite (Build & Dev-Server), `vite-plugin-pwa` (Service Worker & Manifest)
- MediaPipe Tasks Vision (WASM, läuft im Browser)
- Cloudflare Pages (Hosting)

## PWA & Offline

Die App ist installierbar („Zum Startbildschirm hinzufügen") und läuft ohne Netz.

**Nichts wird von Drittanbietern geladen.** WASM-Laufzeit, Gesichts-Modell und
Schriften kommen aus dem eigenen Origin — das ist die Voraussetzung dafür, dass
der Service Worker sie zuverlässig cachen kann, und passt zum Anspruch, dass das
Foto das Gerät nicht verlässt.

- **App-Shell** (HTML, JS, CSS, Icons, Schriften) wird bei der Installation
  vorab gecacht — rund 630 KB.
- **Modell (~3,8 MB) und WASM-Laufzeit (~11 MB)** bewusst nicht: Sie würden die
  Erstinstallation aufblähen, auch wenn nie eine Analyse läuft. Sie landen beim
  ersten Gebrauch im Laufzeit-Cache — oder vorab über *„Für Offline-Nutzung
  vorbereiten"* auf der Startseite.
- **Updates** werden nicht automatisch eingespielt. Ein Reload mitten in einer
  Analyse oder im Freistell-Editor würde Foto, Crop und Retusche verwerfen —
  stattdessen erscheint ein Hinweis mit „Jetzt aktualisieren".

Die Binärassets liegen nicht im Repo (`.gitignore`), sondern werden erzeugt:

```bash
npm run assets          # WASM aus node_modules + Modell vom Google-Storage
```

`npm install` (postinstall) und `npm run build` rufen das automatisch auf.
Schlägt der Modell-Download fehl (Build ohne Netz), bricht der Build nicht ab —
die App nutzt dann zur Laufzeit den CDN-Pfad und ist nur online nutzbar.

### Offline-Test

1. `npm run build && npm run preview`
2. Startseite → *Für Offline-Nutzung vorbereiten*
3. DevTools → Network → Offline, Seite neu laden — die Analyse muss weiter laufen.

Service Worker brauchen HTTPS (oder `localhost`). Auf Cloudflare Pages ist das
Standard.

## Entwicklung

```bash
npm install
npm run dev
```

## Build & Deploy

```bash
npm run build    # → dist/
```

Cloudflare Pages: Build-Command `npm run build`, Output-Directory `dist`.

## Projektstruktur

```
├── index.html              ← Entry-Point
├── src/
│   ├── main.js             ← App-Init, Router, Event-Setup
│   ├── state.js            ← Zentraler App-State
│   ├── router.js           ← Hash-basierter Screen-Router
│   ├── data/
│   │   └── colorTypes.json ← Alle 12 Farbtyp-Definitionen
│   ├── config/
│   │   └── face.js         ← Pfade zu WASM-Laufzeit und Modell
│   ├── modules/
│   │   ├── colorView.js    ← Haupt-View: Swatches, Stage, Farbvorschau
│   │   ├── skinAnalysis.js ← Erscheinungsbild-Analyse & Farbtyp-Matching
│   │   ├── autoAnalysis.js ← bindet die Analyse an die App an
│   │   ├── screens.js      ← Umschalten View / Edit / Compare
│   │   ├── pwa.js          ← Service Worker, Update-Hinweis, Offline-Cache
│   │   ├── camera.js       ← Live-Kamera + Guide-Modal
│   │   ├── crop.js         ← Crop-Tool
│   │   ├── touchup.js      ← Freistell-Editor (Erase/Restore)
│   │   ├── compare.js      ← Split-Screen Vergleichsmodus
│   │   ├── bgRemoval.js    ← Hintergrund-Entfernung (Flood-Fill)
│   │   └── upload.js       ← Datei-Upload + Drag & Drop
│   └── styles/
│       ├── fonts.css       ← selbst gehostete Schriften (@font-face)
│       ├── fonts/          ← woff2-Dateien
│       ├── base.css        ← Reset, Body, Typografie, Buttons
│       ├── components.css  ← Wiederverwendbare UI-Komponenten
│       └── modules/
│           ├── colorView.css
│           ├── camera.css
│           ├── crop.css
│           ├── touchup.css
│           └── compare.css
├── scripts/
│   ├── sync-mediapipe-assets.mjs  ← WASM aus node_modules → public/
│   └── fetch-face-model.mjs       ← Gesichts-Modell → public/models/
└── public/
    ├── icon.svg, icons/    ← App-Icons (im Repo)
    ├── mediapipe/wasm/     ← erzeugt, nicht im Repo
    └── models/             ← erzeugt, nicht im Repo
```
