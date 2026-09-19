/**
 * Körperform aus Maßen bestimmen.
 *
 * Bewusst regelbasiert und nachvollziehbar statt als Black Box: Die Regeln
 * entsprechen den in der Stilberatung üblichen Verhältnissen zwischen Schulter,
 * Büste, Taille und Hüfte. Jede Einstufung liefert mit, WARUM sie so ausfällt —
 * eine Form, die man nicht nachvollziehen kann, hilft beim Einkaufen nicht.
 *
 * Alle Maße in Zentimetern.
 */

/** Ab welcher relativen Abweichung gilt ein Unterschied als deutlich. */
const SIGNIFICANT = 0.05;   // 5 %
/** Ab welchem Taille-zu-Büste/Hüfte-Verhältnis gilt die Taille als abgesetzt. */
const DEFINED_WAIST = 0.75;

/**
 * @param {{schulter:number, bueste:number, taille:number, huefte:number}} m
 * @returns {{key:string, confidence:number, reasons:string[]} | {error:string}}
 */
export function classifyBodyShape(m) {
  const vals = ['schulter', 'bueste', 'taille', 'huefte'].map((k) => Number(m?.[k]));
  if (vals.some((v) => !Number.isFinite(v) || v <= 0)) {
    return { error: 'Bitte alle vier Maße in Zentimetern angeben.' };
  }
  if (vals.some((v) => v < 40 || v > 200)) {
    return { error: 'Die Maße wirken unplausibel — bitte in Zentimetern am Körper messen.' };
  }

  const [schulter, bueste, taille, huefte] = vals;
  const oben = Math.max(schulter, bueste);
  const reasons = [];

  // Relative Unterschiede
  const hueftUeberschuss = (huefte - oben) / oben;
  const obenUeberschuss = (oben - huefte) / huefte;
  const taillenQuotient = taille / Math.max(oben, huefte);
  const taillenFreiheit = taille / Math.min(oben, huefte);

  const waistDefined = taillenQuotient <= DEFINED_WAIST;
  reasons.push(waistDefined
    ? `Taille ${Math.round(taillenQuotient * 100)} % des breitesten Umfangs — deutlich abgesetzt.`
    : `Taille ${Math.round(taillenQuotient * 100)} % des breitesten Umfangs — wenig abgesetzt.`);

  let key;
  if (taillenFreiheit > 1.0) {
    // Taille ist der größte Umfang
    key = 'apfel';
    reasons.push('Taille ist der größte gemessene Umfang.');
  } else if (hueftUeberschuss > SIGNIFICANT) {
    key = 'birne';
    reasons.push(`Hüfte ${Math.round(hueftUeberschuss * 100)} % breiter als Schulter/Büste.`);
  } else if (obenUeberschuss > SIGNIFICANT) {
    key = 'v_form';
    reasons.push(`Schulter/Büste ${Math.round(obenUeberschuss * 100)} % breiter als die Hüfte.`);
  } else if (waistDefined) {
    key = 'sanduhr';
    reasons.push('Oben und unten annähernd gleich breit.');
  } else {
    key = 'rechteck';
    reasons.push('Oben und unten annähernd gleich breit.');
  }

  // Apfel setzt eine wenig abgesetzte Taille voraus; bei klarer Taille ist eine
  // der Dreiecksformen die bessere Beschreibung.
  if (key === 'apfel' && waistDefined) {
    key = hueftUeberschuss > SIGNIFICANT ? 'birne'
        : obenUeberschuss > SIGNIFICANT ? 'v_form'
        : 'sanduhr';
  }

  return { key, confidence: confidenceFor(key, { hueftUeberschuss, obenUeberschuss, taillenQuotient }), reasons };
}

/**
 * Wie eindeutig ist die Einstufung? Nah an einer Grenze heißt: zwei Formen
 * kommen in Frage, und der Hinweis darauf ist ehrlicher als eine glatte Zahl.
 */
function confidenceFor(key, { hueftUeberschuss, obenUeberschuss, taillenQuotient }) {
  const margins = {
    birne:    hueftUeberschuss - SIGNIFICANT,
    v_form:   obenUeberschuss - SIGNIFICANT,
    sanduhr:  DEFINED_WAIST - taillenQuotient,
    rechteck: taillenQuotient - DEFINED_WAIST,
    apfel:    taillenQuotient - DEFINED_WAIST
  };
  const margin = margins[key] ?? 0;
  // 0 an der Grenze, 100 bei deutlichem Abstand (0.10 = 10 Prozentpunkte)
  return Math.round(Math.max(0, Math.min(1, margin / 0.10)) * 100);
}
