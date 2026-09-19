/**
 * Silhouetten-Bibliothek für die Stilberatung.
 *
 * Warum gezeichnet statt fotografiert: Stockfotos von Kleidung sind
 * lizenzpflichtig, veralten schnell und zeigen immer einen bestimmten Körper.
 * Die Silhouetten lassen sich stattdessen in den Farben der jeweiligen Person
 * einfärben — die Stilkarte zeigt damit den Stil in DER EIGENEN Palette statt
 * an einem fremden Model.
 *
 * Alle Pfade in viewBox "0 0 100 120".
 *
 * Rollen je Pfad:
 *   body  — Hauptfläche, bekommt die Basisfarbe
 *   trim  — Bund, Saum, Revers, Sohle: eine Stufe dunkler
 *   line  — reine Kontur (kein Fill), z. B. Trägernaht oder Knopfleiste
 */

export const GARMENTS = {
  // ── Oberteile ──────────────────────────────────────────────────────────
  tshirt: {
    label: 'T-Shirt', category: 'oberteil',
    parts: [{ role: 'body', d: 'M36 16 L26 19 L8 33 L17 47 L28 39 L28 104 L72 104 L72 39 L83 47 L92 33 L74 19 L64 16 C60 25 40 25 36 16 Z' }]
  },
  top: {
    label: 'Top', category: 'oberteil',
    parts: [{ role: 'body', d: 'M38 16 L30 21 L30 104 L70 104 L70 21 L62 16 C58 26 42 26 38 16 Z' }]
  },
  bluse: {
    label: 'Bluse', category: 'oberteil',
    parts: [
      { role: 'body', d: 'M36 15 L24 20 L10 42 L16 78 L27 75 L27 106 L73 106 L73 75 L84 78 L90 42 L76 20 L64 15 L50 32 Z' },
      { role: 'trim', d: 'M42 15 L50 32 L58 15 L50 21 Z' },
      { role: 'line', d: 'M50 32 L50 106' }
    ]
  },
  pullover: {
    label: 'Strickpullover', category: 'oberteil',
    parts: [
      { role: 'body', d: 'M36 20 L24 24 L9 45 L15 80 L27 77 L27 100 L73 100 L73 77 L85 80 L91 45 L76 24 L64 20 C60 30 40 30 36 20 Z' },
      { role: 'trim', d: 'M27 100 L73 100 L73 108 L27 108 Z' }
    ]
  },
  sweatshirt: {
    label: 'Sweatshirt', category: 'oberteil',
    parts: [
      { role: 'body', d: 'M36 20 L24 24 L9 45 L15 80 L27 77 L27 100 L73 100 L73 77 L85 80 L91 45 L76 24 L64 20 C60 30 40 30 36 20 Z' },
      { role: 'trim', d: 'M36 20 C39 9 61 9 64 20 C58 26 42 26 36 20 Z' },
      { role: 'trim', d: 'M27 100 L73 100 L73 108 L27 108 Z' }
    ]
  },

  // ── Jacken & Mäntel ────────────────────────────────────────────────────
  blazer: {
    label: 'Blazer', category: 'jacke',
    parts: [
      { role: 'body', d: 'M36 16 L23 22 L10 44 L16 80 L27 76 L27 108 L73 108 L73 76 L84 80 L90 44 L77 22 L64 16 L50 50 Z' },
      { role: 'trim', d: 'M36 16 L50 50 L45 16 Z' },
      { role: 'trim', d: 'M64 16 L50 50 L55 16 Z' }
    ]
  },
  jacke: {
    label: 'Jacke', category: 'jacke',
    parts: [
      { role: 'body', d: 'M36 20 L24 25 L13 46 L19 73 L29 70 L29 88 L71 88 L71 70 L81 73 L87 46 L76 25 L64 20 C60 29 40 29 36 20 Z' },
      { role: 'trim', d: 'M29 88 L71 88 L71 96 L29 96 Z' },
      { role: 'line', d: 'M50 25 L50 88' }
    ]
  },
  mantel: {
    label: 'Mantel', category: 'jacke',
    parts: [
      { role: 'body', d: 'M36 14 L22 20 L8 44 L14 84 L27 80 L27 116 L73 116 L73 80 L86 84 L92 44 L78 20 L64 14 L50 48 Z' },
      { role: 'trim', d: 'M36 14 L50 48 L45 14 Z' },
      { role: 'trim', d: 'M64 14 L50 48 L55 14 Z' },
      { role: 'trim', d: 'M27 62 L73 62 L73 70 L27 70 Z' }
    ]
  },

  // ── Kleider ────────────────────────────────────────────────────────────
  kleid: {
    label: 'Kleid (A-Linie)', category: 'kleid',
    parts: [
      { role: 'body', d: 'M38 15 L29 19 L25 44 L31 47 L19 112 L81 112 L69 47 L75 44 L71 19 L62 15 C58 25 42 25 38 15 Z' },
      { role: 'trim', d: 'M31 47 L69 47 L70 53 L30 53 Z' }
    ]
  },
  etuikleid: {
    label: 'Etuikleid', category: 'kleid',
    parts: [{ role: 'body', d: 'M38 15 L31 19 L31 46 L33 60 L31 102 L69 102 L67 60 L69 46 L69 19 L62 15 C58 25 42 25 38 15 Z' }]
  },
  maxikleid: {
    label: 'Maxikleid', category: 'kleid',
    parts: [
      { role: 'body', d: 'M38 13 L29 17 L26 40 L33 44 L16 118 L84 118 L67 44 L74 40 L71 17 L62 13 C58 23 42 23 38 13 Z' },
      { role: 'trim', d: 'M33 44 L67 44 L68 50 L32 50 Z' }
    ]
  },

  // ── Unterteile ─────────────────────────────────────────────────────────
  rock: {
    label: 'Rock (A-Linie)', category: 'unterteil',
    parts: [
      { role: 'body', d: 'M30 40 L70 40 L83 106 L17 106 Z' },
      { role: 'trim', d: 'M29 38 L71 38 L71 48 L29 48 Z' }
    ]
  },
  bleistiftrock: {
    label: 'Bleistiftrock', category: 'unterteil',
    parts: [
      { role: 'body', d: 'M32 40 L68 40 L71 100 L29 100 Z' },
      { role: 'trim', d: 'M31 38 L69 38 L69 48 L31 48 Z' }
    ]
  },
  jeans: {
    label: 'Jeans', category: 'unterteil',
    parts: [
      { role: 'body', d: 'M27 40 L73 40 L75 62 L70 114 L55 114 L50 68 L45 114 L30 114 L25 62 Z' },
      { role: 'trim', d: 'M26 38 L74 38 L74 48 L26 48 Z' }
    ]
  },
  stoffhose: {
    label: 'Stoffhose', category: 'unterteil',
    parts: [
      { role: 'body', d: 'M27 40 L73 40 L79 114 L55 114 L50 72 L45 114 L21 114 Z' },
      { role: 'trim', d: 'M26 38 L74 38 L74 47 L26 47 Z' }
    ]
  },

  // ── Schuhe & Accessoires ───────────────────────────────────────────────
  sneaker: {
    label: 'Sneaker', category: 'schuhe',
    parts: [
      { role: 'body', d: 'M13 88 L13 68 C13 59 24 57 31 62 L51 74 L74 80 C83 82 88 86 88 92 L13 92 Z' },
      { role: 'trim', d: 'M10 92 L90 92 L90 100 L10 100 Z' }
    ]
  },
  stiefelette: {
    label: 'Stiefelette', category: 'schuhe',
    parts: [
      { role: 'body', d: 'M35 44 L62 44 L64 80 L83 88 C89 90 91 94 91 98 L35 98 Z' },
      { role: 'trim', d: 'M33 98 L93 98 L93 104 L33 104 Z' }
    ]
  },
  tasche: {
    label: 'Tasche', category: 'accessoire',
    parts: [
      { role: 'body', d: 'M24 56 L76 56 L82 106 L18 106 Z' },
      { role: 'trim', d: 'M24 56 L76 56 L78 70 L22 70 Z' },
      { role: 'line', d: 'M33 56 C33 28 67 28 67 56' }
    ]
  },
  schal: {
    label: 'Schal', category: 'accessoire',
    parts: [
      { role: 'body', d: 'M30 20 L70 20 L66 36 L62 112 L52 112 L50 40 L48 112 L38 112 L34 36 Z' },
      { role: 'trim', d: 'M30 20 L70 20 L69 28 L31 28 Z' }
    ]
  }
};

/**
 * Baut das SVG-Markup eines Kleidungsstücks.
 * @param {string} key      Schlüssel aus GARMENTS
 * @param {object} colors   { body, trim, line }
 * @param {object} [opts]   { title } — barrierefreier Name
 */
export function garmentSvg(key, colors, opts = {}) {
  const g = GARMENTS[key];
  if (!g) return '';
  const title = opts.title ?? g.label;
  const paths = g.parts.map((p) => p.role === 'line'
    ? `<path d="${p.d}" fill="none" stroke="${colors.line}" stroke-width="1.4" stroke-linecap="round"/>`
    : `<path d="${p.d}" fill="${p.role === 'trim' ? colors.trim : colors.body}"/>`
  ).join('');
  return `<svg class="garment" viewBox="0 0 100 120" role="img" aria-label="${title}">${paths}</svg>`;
}

export function garmentLabel(key) { return GARMENTS[key]?.label ?? key; }
