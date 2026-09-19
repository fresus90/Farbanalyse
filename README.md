# Farbanalyse

Persönliche Farbanalyse-App — Finde deinen saisonalen Farbtyp und entdecke, welche Farben dir am besten stehen.

## Features

- **12 Farbtypen** — Frühling, Sommer, Herbst, Winter (je 3 Untertypen)
- **Automatische Farbtyp-Bestimmung** — MediaPipe Face Landmarker, Lab-Clustering
  von Haut/Haar/Iris, Sklera-Weißabgleich, 7-dimensionales Typ-Matching
- **Foto-Upload & Kamera** — Live-Kamera mit Aufnahmehilfe oder Datei-Upload
- **Freistellen** — gelernte Personen-Segmentierung (MediaPipe), lokal im Browser
- **Crop & Touch-Up** — Bildausschnitt anpassen, Freistellen nachbessern
- **Farbvergleich** — Zwei Farbtypen nebeneinander vergleichen (Split-Screen)
- **Stilberatung** — 8 Stilrichtungen, in den eigenen Farben dargestellt
- **Körperform** — aus vier Maßen bestimmt, mit nachvollziehbarer Begründung
- **Responsive** — Optimiert für Mobile und Desktop
- **PWA** — installierbar, offline nutzbar, keine Drittanbieter-Requests

## Tech-Stack

- Vanilla JS (ES Modules)
- Vite (Build & Dev-Server), `vite-plugin-pwa` (Service Worker & Manifest)
- MediaPipe Tasks Vision (WASM, läuft im Browser)
- Cloudflare Pages (Hosting)

## Aufnahmehilfe

Die Analyse ist nur so gut wie das Foto. Deshalb bewertet die Live-Kamera den
Sucherstrom laufend und sagt, **was zu ändern ist**, bevor ausgelöst wird —
sieben Prüfpunkte, jeder mit gemessenem Wert, Zielwert und konkreter Handlung:

| Prüfpunkt | misst | Beispielhinweis |
|---|---|---|
| Abstand | Gesichtsbreite im Bild | „Näher herangehen" (22 % → mind. 34 %) |
| Position | Abweichung vom Oval | „Gesicht nach rechts ins Oval bewegen" |
| Kopfhaltung | Neigung der Augenlinie | „Kopf nach links aufrichten" (12° → unter 5°) |
| Kamerahöhe | z-Differenz Stirn ↔ Kinn | „Kamera höher halten — sie zeigt von unten nach oben" |
| Belichtung | Hauthelligkeit, Clipping je Kanal | „Zu dunkel" (60 → 110 bis 200) |
| Seitenlicht | Helligkeit linke ↔ rechte Wange | „Zur Lichtquelle drehen (nach links)" |
| Lichtfarbe | Farbstich im Augenweiß | „Warmes Kunstlicht" (31 % → unter 16 %) |

Das Positionierungs-Oval färbt sich mit, der Auslöser zeigt Bereitschaft an.
Blockiert wird nichts — wer trotzdem auslösen will, kann das.

Zwei Details, die leicht falsch herum landen:

- **Die Vorschau ist bei der Frontkamera gespiegelt, die Pixeldaten sind es
  nicht.** Jede Richtungsanweisung wird deshalb in Bildschirmkoordinaten
  umgerechnet, sonst stünde in „nach links" das Gegenteil dessen, was zu tun ist.
- **Die Kamerahöhe kommt aus den z-Werten der Landmarks**, nicht aus der
  Rotationsmatrix: MediaPipe legt den Ursprung in die Kopfmitte, kleinere z sind
  näher an der Kamera. Ist die Kamera unter Augenhöhe, liegt das Kinn näher als
  die Stirn — das Vorzeichen ist damit ableitbar statt geraten.

Der Landmarker läuft gedrosselt (alle 160 ms auf einem 320-px-Bild); für
Rückmeldung an einen Menschen reichen ein paar Bilder pro Sekunde. Lässt er sich
nicht laden, blendet sich die Hilfe aus und die App bleibt bedienbar.

Nach der Aufnahme prüft die Analyse zusätzlich (`assessQuality`) — aber einen
Hinweis nach dem Auslösen kann man nicht mehr befolgen, ohne das Foto zu
wiederholen.

## Freistellen

Hauptweg ist eine gelernte Segmentierung (MediaPipe ImageSegmenter,
`selfie_segmenter`, ~250 KB). Das ursprüngliche Flood-Fill bleibt als
Rückfallebene.

Warum der Wechsel: Das Flood-Fill schätzte **eine** globale Hintergrundfarbe aus
dem Mittelwert aller Randpixel und entfernte alles, was in RGB näher als 48
daran lag. Das scheitert an allem, was in echten Fotos vorkommt — an einem
Farbverlauf oder Schatten an der Wand, an blondem Haar vor heller Wand, an
grauer Kleidung vor grauer Wand. Haar ist der schwerste Fall: Jede Strähne ist
eine Mischung aus Haar- und Wandfarbe, und ein harter Schwellwert kann eine
Mischung nur ganz behalten oder ganz verwerfen.

Zwei Dinge dazu, die über „Modell einbauen" hinausgehen:

- **Randentmischung.** Ein halbtransparentes Randpixel ist eine Mischung
  `C = a·F + (1-a)·B` und trägt damit noch die Farbe der Wand, vor der
  fotografiert wurde. Diese App legt aber beliebige Farben *hinter* die Person —
  der Saum wäre vor jeder neuen Farbe sichtbar und würde genau den Eindruck
  verfälschen, um den es geht. `F` wird deshalb zurückgerechnet.
- **Plausibilitätsprüfung.** Erkennt das Modell niemanden, liefert es keinen
  Fehler, sondern eine Maske nahe null — daraus entstünde wortlos ein fast
  leeres Bild. Maximalwert, Personenanteil und Polarität werden geprüft; fällt
  die Maske durch, läuft das Flood-Fill, und die App sagt es.

Warum nicht `selfie_multiclass_256x256` mit eigener Haar-Klasse: Das Modell
wiegt 16 MB statt 250 KB. Beide rechnen intern in 256×256 — der Detailgrad an
der Haarkante ist derselbe, der Unterschied ist rein semantisch.

## Stilberatung

Die Beratung führt drei Ebenen zusammen:

1. **Farbtyp** — aus der Analyse oder von Hand gewählt
2. **Stilrichtung** — wählt die Nutzerin/der Nutzer selbst. Geschmack lässt sich
   nicht aus einem Foto ableiten, deshalb wird er auch nicht geraten.
3. **Körperform** — aus Schulter, Büste, Taille und Hüfte bestimmt
   (`src/core/bodyShape.js`), regelbasiert und mit ausgegebener Begründung.
   Wer die eigene Form kennt, wählt sie direkt.

Daraus entstehen Basisfarben, Akzentfarben, passende Schnitte, Materialien und
eine Liste dessen, was zurückstehen sollte.

**Die Silhouetten sind gezeichnet, nicht fotografiert** (`src/data/garments.js`).
Stockfotos wären lizenzpflichtig, würden veralten und immer einen bestimmten
Körper zeigen. Gezeichnete Silhouetten lassen sich dagegen einfärben — die
Stilkarten zeigen jeden Stil in der *eigenen* Palette statt an einem fremden
Model. Akzentfarben landen dabei auf Oberteilen und Accessoires, nie auf Hosen
oder Mänteln: Farbe wirkt am Gesicht.

Stilrichtung, Körperform und Maße werden lokal gespeichert
(`src/storage/preferences.js`, `localStorage`) und verlassen das Gerät nicht.

### Navigation

Die Screens laufen über den URL-Hash (`#farbe`, `#stil`, `#bearbeiten`,
`#vergleich`). Das ist nicht Kosmetik: Als installierte PWA im Standalone-Modus
würde die Android-Zurück-Geste ohne History-Einträge die App verlassen, statt
einen Screen zurückzugehen.

## PWA & Offline

Die App ist installierbar („Zum Startbildschirm hinzufügen") und läuft ohne Netz.

**Nichts wird von Drittanbietern geladen.** WASM-Laufzeit, Gesichts-Modell und
Schriften kommen aus dem eigenen Origin — das ist die Voraussetzung dafür, dass
der Service Worker sie zuverlässig cachen kann, und passt zum Anspruch, dass das
Foto das Gerät nicht verlässt.

- **App-Shell** (HTML, JS, CSS, Icons, Schriften) wird bei der Installation
  vorab gecacht — rund 630 KB.
- **Modelle (~4,1 MB) und WASM-Laufzeit (~11 MB)** bewusst nicht: Sie würden die
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
Node-Version ist über `.node-version` auf 22 gepinnt — Vite 5 und
`vite-plugin-pwa` brauchen mindestens Node 18, und der Plattform-Default ist bei
älteren Projekten niedriger.

## Projektstruktur

```
├── index.html              ← Entry-Point
├── src/
│   ├── main.js             ← App-Init, Router, Event-Setup
│   ├── state.js            ← Zentraler App-State
│   ├── router.js           ← Hash-basierter Screen-Router
│   ├── data/
│   │   ├── colorTypes.json ← Alle 12 Farbtyp-Definitionen
│   │   ├── styleTypes.json ← 8 Stilrichtungen
│   │   ├── bodyShapes.json ← 5 Körperformen
│   │   └── garments.js     ← SVG-Silhouetten der Kleidungsstücke
│   ├── config/
│   │   ├── face.js         ← Pfade zu WASM-Laufzeit und Gesichts-Modell
│   │   └── segmentation.js ← Pfade zum Freistell-Modell
│   ├── core/
│   │   ├── color.js        ← Lab-Konvertierungen, ΔE76/ΔE2000
│   │   ├── faceModel.js    ← geteiltes Modell + WASM-Laufzeit
│   │   ├── faceTracker.js  ← Landmarker im VIDEO-Modus
│   │   ├── frameQuality.js ← Bewertung des Sucherbildes
│   │   ├── segmentation.js ← Personen-Maske (MediaPipe ImageSegmenter)
│   │   ├── palette.js      ← Basis-/Akzentfarben, dunkler Anker
│   │   └── bodyShape.js    ← Körperform aus Maßen
│   ├── storage/
│   │   └── preferences.js  ← Stil, Körperform, Maße (localStorage)
│   ├── modules/
│   │   ├── colorView.js    ← Haupt-View: Swatches, Stage, Farbvorschau
│   │   ├── skinAnalysis.js ← Erscheinungsbild-Analyse & Farbtyp-Matching
│   │   ├── autoAnalysis.js ← bindet die Analyse an die App an
│   │   ├── styleView.js    ← Stilberatung: Galerie, Detail, Empfehlung
│   │   ├── cameraGuide.js  ← Live-Schleife und Anzeige der Aufnahmehilfe
│   │   ├── screens.js      ← Screens + Hash-Routing
│   │   ├── pwa.js          ← Service Worker, Update-Hinweis, Offline-Cache
│   │   ├── camera.js       ← Live-Kamera + Guide-Modal
│   │   ├── crop.js         ← Crop-Tool
│   │   ├── touchup.js      ← Freistell-Editor (Erase/Restore)
│   │   ├── compare.js      ← Split-Screen Vergleichsmodus
│   │   ├── bgRemoval.js    ← Freistellen (Segmentierung + Flood-Fill)
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
│           ├── compare.css
│           └── style.css
├── scripts/
│   ├── sync-mediapipe-assets.mjs  ← WASM aus node_modules → public/
│   └── fetch-models.mjs           ← Modelle → public/models/
└── public/
    ├── icon.svg, icons/    ← App-Icons (im Repo)
    ├── mediapipe/wasm/     ← erzeugt, nicht im Repo
    └── models/             ← erzeugt, nicht im Repo
```
