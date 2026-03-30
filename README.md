# Farbanalyse App

Persönliche Farbtyp-Analyse mit Foto-Upload, Quiz und Farbpaletten-Vergleich.

## Projektstruktur

```
src/
├── data/
│   └── colorTypes.js       ← Alle 12 Farbtypen (Paletten, Beschreibungen)
├── styles/
│   └── main.css            ← Globale Styles
├── modules/
│   ├── quiz/               ← Onboarding-Quiz (Swipe + Fragen)
│   │   ├── quiz.js
│   │   └── quiz.css
│   ├── photo/              ← Foto-Upload + Hintergrundentfernung
│   │   ├── photo.js
│   │   └── photo.css
│   ├── editor/             ← Crop + Touchup (Freistellung)
│   │   ├── editor.js
│   │   └── editor.css
│   ├── palette/            ← Farbpaletten + Swatches
│   │   ├── palette.js
│   │   └── palette.css
│   └── compare/            ← Split-Screen Farbvergleich
│       ├── compare.js
│       └── compare.css
└── main.js                 ← App-Einstiegspunkt
```

## Module

| Modul | Status | Beschreibung |
|-------|--------|--------------|
| `data/colorTypes` | ✅ Fertig | 12 Farbtypen mit Paletten |
| `palette` | ✅ Fertig | Swatches, Typ-Wechsel, Hintergrund |
| `photo` | ✅ Fertig | Upload, BG-Removal, Kamera |
| `editor` | ✅ Fertig | Crop + Touchup-Pinsel aus Referenz-HTML |
| `compare` | ✅ Fertig | Split-Screen aus Referenz-HTML |
| `quiz` | 🔧 In Arbeit | Onboarding-Quiz |

## Entwicklung

```bash
npm install
npm run dev
```

## Deploy (Netlify)

Repo mit Netlify verbinden → auto-deploy bei jedem Push auf `main`.
Build-Kommando: `npm run build`  
Publish-Verzeichnis: `dist`
