/**
 * Hallazgos degenerativos candidatos: contrato `pfi.degenerative-findings.v1`.
 *
 * El primero es la estenosis subarticular en RM axial T2, clasificada en tres
 * categorías por lado y por nivel. Dos cosas gobiernan todo este módulo:
 *
 * 1. **No es un diagnóstico.** Es una clasificación asistida que requiere revisión
 *    profesional. El vocabulario de la pantalla lo sostiene: "hallazgo candidato",
 *    "probabilidad estimada por el modelo", nunca "lesión detectada" ni "resultado".
 *
 * 2. **La coordenada es externa.** El modelo no localiza la anatomía: alguien tiene que
 *    marcarle dónde está el receso subarticular. Eso significa que el resultado depende
 *    de dónde se puso el punto, y la pantalla tiene que decirlo — un hallazgo que se
 *    presenta sin esa aclaración se lee como si el sistema lo hubiera encontrado solo.
 *
 * El parseo es estricto a propósito. Un hallazgo mal formado se descarta en vez de
 * mostrarse a medias: una probabilidad que no suma, o una etiqueta fuera del catálogo,
 * puesta en pantalla al lado de una imagen del paciente, se lee con la misma autoridad
 * que una correcta.
 */

export const DEGENERATIVE_FINDINGS_SCHEMA = "pfi.degenerative-findings.v1";

export const SEVERITY_LABELS = ["normal_mild", "moderate", "severe"] as const;
export type Severity = typeof SEVERITY_LABELS[number];

export const FINDING_SIDES = ["left", "right"] as const;
export type FindingSide = typeof FINDING_SIDES[number];

export const FINDING_LEVELS = ["L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"] as const;
export type FindingLevel = typeof FINDING_LEVELS[number];

export type ReviewStatus = "pending" | "accepted" | "rejected" | "edited";

export type DegenerativeFinding = {
  findingId: string;
  findingType: string;
  level: FindingLevel;
  side: FindingSide;
  label: Severity;
  probabilities: Record<Severity, number>;
  /** Corte de la serie axial sobre el que se clasificó. */
  slicePosition: number | null;
  /** `true` cuando la coordenada anatómica la puso una persona, no un localizador. */
  externalCoordinate: boolean;
  researchOnly: boolean;
  modelId: string;
  reviewRequired: boolean;
  reviewStatus: ReviewStatus;
};

/** Cuánto puede desviarse de 1 la suma de probabilidades antes de rechazar el hallazgo. */
const PROBABILITY_SUM_TOLERANCE = 0.02;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Las tres probabilidades, o `null` si no forman una distribución.
 *
 * Se exigen las tres clases, finitas, dentro de [0,1] y sumando 1 con tolerancia. Una
 * distribución rota no se normaliza para salvarla: si el modelo no informó lo que dice
 * el contrato, lo que corresponde es no mostrar el hallazgo, no arreglarlo acá.
 */
export function parseProbabilities(value: unknown): Record<Severity, number> | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const parsed = {} as Record<Severity, number>;
  let total = 0;
  for (const label of SEVERITY_LABELS) {
    const item = raw[label];
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1) return null;
    parsed[label] = item;
    total += item;
  }
  return Math.abs(total - 1) <= PROBABILITY_SUM_TOLERANCE ? parsed : null;
}

function parseReviewStatus(value: unknown): ReviewStatus {
  const status = text(value);
  return status === "accepted" || status === "rejected" || status === "edited" ? status : "pending";
}

export function parseFinding(value: unknown): DegenerativeFinding | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const anatomy = asRecord(raw.anatomy) ?? {};
  const level = text(anatomy.level) as FindingLevel;
  const side = text(anatomy.side) as FindingSide;
  if (!FINDING_LEVELS.includes(level) || !FINDING_SIDES.includes(side)) return null;

  const classification = asRecord(raw.classification) ?? {};
  const label = text(classification.label) as Severity;
  if (!SEVERITY_LABELS.includes(label)) return null;
  const probabilities = parseProbabilities(classification.probabilities);
  if (!probabilities) return null;

  const findingId = text(raw.findingId);
  if (!findingId) return null;

  const localization = asRecord(raw.localization) ?? {};
  const sourceSeries = asRecord(raw.sourceSeries) ?? {};
  const model = asRecord(raw.model) ?? {};
  const review = asRecord(raw.review) ?? {};

  return {
    findingId,
    findingType: text(raw.findingType) || "subarticular_stenosis",
    level,
    side,
    label,
    probabilities,
    slicePosition: typeof sourceSeries.position === "number" ? sourceSeries.position : null,
    externalCoordinate: text(localization.source) === "external_coordinate",
    /*
     * Ausente se toma como `true`, no como `false`.
     *
     * Es el único campo del contrato donde el default inseguro sería el permisivo: un
     * hallazgo que no declara su alcance no puede pasar por validado, porque la
     * consecuencia de equivocarse es presentar como clínico algo que es de investigación.
     */
    researchOnly: localization.researchOnly !== false,
    modelId: text(model.modelId),
    reviewRequired: review.required !== false,
    reviewStatus: parseReviewStatus(review.status),
  };
}

/**
 * Los hallazgos de una corrida, o vacío si el envelope no es el contrato esperado.
 *
 * Se exige la versión de esquema: un envelope de otra versión puede tener los mismos
 * nombres de campo con otro significado, y adivinar cuál es cuál es exactamente lo que
 * no se puede hacer con una salida que se muestra al lado de una imagen del paciente.
 */
export function parseDegenerativeFindings(value: unknown): DegenerativeFinding[] {
  const envelope = asRecord(value);
  if (!envelope || text(envelope.schemaVersion) !== DEGENERATIVE_FINDINGS_SCHEMA) return [];
  const findings = envelope.findings;
  if (!Array.isArray(findings)) return [];
  return findings
    .map(parseFinding)
    .filter((item): item is DegenerativeFinding => item !== null);
}

/** Orden de lectura: por nivel de arriba hacia abajo, y dentro del nivel izquierda antes que derecha. */
export function sortFindings(findings: DegenerativeFinding[]): DegenerativeFinding[] {
  return findings.slice().sort((a, b) => {
    const byLevel = FINDING_LEVELS.indexOf(a.level) - FINDING_LEVELS.indexOf(b.level);
    return byLevel !== 0 ? byLevel : FINDING_SIDES.indexOf(a.side) - FINDING_SIDES.indexOf(b.side);
  });
}

export type ImagePoint = { x: number; y: number };

/**
 * Pasa un punto del visor a píxeles de la imagen DICOM.
 *
 * El visor entrega los clics en una base normalizada 0..256 que no depende del tamaño
 * real del corte ni de cómo esté escalado en pantalla. El modelo espera píxeles de la
 * imagen de origen. Mandar la coordenada sin convertir es el error que el contrato
 * advierte explícitamente: en una serie de 320x320 el punto caería a un 80% de donde
 * se marcó, y el resultado que vuelve sería de otra parte de la anatomía.
 *
 * Devuelve `null` cuando no se conocen las dimensiones del corte crudo, porque sin
 * ellas la conversión no se puede hacer y suponer 256x256 sería inventar la escala.
 */
export function viewerPointToImagePixels(
  point: ImagePoint,
  pixelMeta: { width: number; height: number } | null | undefined,
): ImagePoint | null {
  if (!pixelMeta) return null;
  const { width, height } = pixelMeta;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  return {
    x: clamp(point.x / 256 * width, width),
    y: clamp(point.y / 256 * height, height),
  };
}
