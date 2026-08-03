/**
 * Rangos de referencia de las mediciones lumbares.
 *
 * Marcar un valor como fuera de rango es una afirmación, así que cada umbral viene
 * con la fuente que lo sostiene y con el texto que se muestra al lado del número. Un
 * umbral suelto en el código es un número mágico: nadie sabe de dónde salió, nadie
 * puede discutirlo, y termina heredándose sin revisión.
 *
 * Dos reglas que la implementación respeta:
 *
 * **El rango declara contra qué compara.** En el canal, el umbral depende de si la
 * máscara delimita el canal óseo o el saco tecal, y eso todavía no está confirmado
 * contra el dataset de origen. Se dice en el chip en vez de esconderlo detrás de un
 * número que parecería definitivo.
 *
 * **Marcar no es diagnosticar.** El texto describe la relación con el rango ("por
 * debajo del rango de referencia"), nunca nombra una patología. La diferencia importa:
 * un canal estrecho es un hallazgo, y estenosis sintomática es un diagnóstico que
 * necesita la clínica del paciente, no una imagen.
 */

export type ReferenceRange = {
  /** Mínimo esperado; por debajo se marca. */
  min?: number;
  /** Máximo esperado; por encima se marca. */
  max?: number;
  unit: "mm" | "deg" | "mm2";
  /** Qué se está comparando, cuando la medición admite más de una lectura. */
  assumes?: string;
  source: string;
};

/**
 * Por `labelKey` de la medición, que es el identificador canónico del AI Module.
 *
 * Solo están las magnitudes que un informe compara contra un rango. El ancho de un
 * disco o el área de una vértebra se miden y se reportan, pero no tienen un corte
 * normal/anormal aceptado: inventarles uno sería el error que estas reglas evitan.
 */
export const REFERENCE_RANGES: Record<string, ReferenceRange> = {
  "canal ap": {
    min: 12,
    unit: "mm",
    assumes: "canal óseo; si la clase delimita el saco tecal el corte es 10 mm",
    source: "Diámetro AP del canal lumbar: normal 15-25 mm, estenosis relativa por debajo de 12 mm",
  },
  "disc height": {
    min: 7,
    unit: "mm",
    source: "Altura discal lumbar en sagital T2: por debajo de ~7 mm se describe como disminuida",
  },
};

export type RangeVerdict = {
  status: "below" | "above" | "within";
  /** Texto descriptivo, nunca un nombre de patología. */
  text: string;
  range: ReferenceRange;
};

/**
 * Compara un valor con su rango. Devuelve null cuando no hay rango para esa medición
 * o cuando el valor no está en las unidades que el rango asume: comparar milímetros
 * con píxeles daría un veredicto sobre una escala que la corrida no informó.
 */
export function checkRange(labelKey: string, value: number, unit: string): RangeVerdict | null {
  const range = REFERENCE_RANGES[labelKey];
  if (!range || unit !== range.unit || !Number.isFinite(value)) return null;
  if (range.min !== undefined && value < range.min) {
    return { status: "below", text: `por debajo del rango de referencia (≥ ${range.min} ${range.unit})`, range };
  }
  if (range.max !== undefined && value > range.max) {
    return { status: "above", text: `por encima del rango de referencia (≤ ${range.max} ${range.unit})`, range };
  }
  return { status: "within", text: `dentro del rango de referencia`, range };
}

/** Etiqueta corta para el chip de la fila. */
export function rangeBadge(verdict: RangeVerdict) {
  if (verdict.status === "below") return `bajo · ref ≥ ${verdict.range.min}`;
  if (verdict.status === "above") return `alto · ref ≤ ${verdict.range.max}`;
  return "en rango";
}
