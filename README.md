# Farbanalyse

Persönliche Farbanalyse-App — Finde deinen saisonalen Farbtyp und entdecke, welche Farben dir am besten stehen.

## Features

- **12 Farbtypen** — Frühling, Sommer, Herbst, Winter (je 3 Untertypen)
- **Foto-Upload & Kamera** — Live-Kamera mit Gesichts-Guide oder Datei-Upload
- **Hintergrund-Entfernung** — Client-seitiges Freistellen per Canvas
- **Crop & Touch-Up** — Bildausschnitt anpassen, Freistellen nachbessern
- **Farbvergleich** — Zwei Farbtypen nebeneinander vergleichen (Split-Screen)
- **Responsive** — Optimiert für Mobile und Desktop

## Tech-Stack

- Vanilla JS (ES Modules)
- Vite (Build & Dev-Server)
- Cloudflare Pages (Hosting)

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
│   ├── modules/
│   │   ├── colorView.js    ← Haupt-View: Swatches, Stage, Farbvorschau
│   │   ├── camera.js       ← Live-Kamera + Guide-Modal
│   │   ├── crop.js         ← Crop-Tool
│   │   ├── touchup.js      ← Freistell-Editor (Erase/Restore)
│   │   ├── compare.js      ← Split-Screen Vergleichsmodus
│   │   ├── bgRemoval.js    ← Hintergrund-Entfernung (Flood-Fill)
│   │   └── upload.js       ← Datei-Upload + Drag & Drop
│   └── styles/
│       ├── base.css        ← Reset, Body, Typografie, Buttons
│       ├── components.css  ← Wiederverwendbare UI-Komponenten
│       └── modules/
│           ├── colorView.css
│           ├── camera.css
│           ├── crop.css
│           ├── touchup.css
│           └── compare.css
└── public/                 ← Statische Assets (Bilder, Fonts etc.)
```
