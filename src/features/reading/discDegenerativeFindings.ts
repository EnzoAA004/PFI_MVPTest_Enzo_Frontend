/**
 * Hallazgos degenerativos discales — contrato `pfi.disc-degenerative-findings.v1` (P10.7).
 *
 * Va aparte del de P10.6 (`pfi.degenerative-findings.v1`) a propósito, como pide el
 * handoff: uno clasifica estenosis —central, foraminal, subarticular— con una escala de
 * severidad, y el otro clasifica ocho variables del disco con escalas incompatibles entre
 * sí. Mezclarlos obligaría a inventar una severidad común que no existe.
 *
 * ## Lo que más se protege
 *
 * **Que no se muestre un hallazgo que el contrato no sostiene.** Una probabilidad que no
 * suma, o una etiqueta fuera del catálogo, puesta al lado de una imagen del paciente se
 * lee con la misma autoridad que una correcta.
 *
 * **Y que la calidad del modelo viaje con el hallazgo.** El modelo acierta muy distinto
 * según la tarea: F1 0,846 en abombamiento discal y 0,125 en espondilolistesis. Una barra
 * de probabilidad no comunica esa diferencia —solo dice cuán confiada está *esa*
 * predicción—, así que el `deploymentStatus` no es metadato: es la condición bajo la cual
 * se lee el número. Por eso `parseDiscFinding` lo exige y descarta el hallazgo si falta.
 */

export const DISC_FINDING_TYPES = [
  "disc_bulging",
  "disc_narrowing",
  "upper_endplate_change",
  "lower_endplate_change",
  "pfirrmann_grade",
  "modic_change",
  "disc_herniation",
  "spondylolisthesis",
] as const;
export type DiscFindingType = typeof DISC_FINDING_TYPES[number];

export const DISC_LEVELS = ["L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"] as const;
export type DiscLevel = typeof DISC_LEVELS[number];

/** Cuán lejos llegó la validación de cada tarea. Decide cómo se presenta, no si se guarda. */
export const DEPLOYMENT_STATUSES = ["supported_internal", "experimental", "not_product_supported"] as const;
export type DeploymentStatus = typeof DEPLOYMENT_STATUSES[number];

export const DISC_REVIEW_STATUSES = ["pending", "accepted", "observed", "rejected", "edited"] as const;
export type DiscReviewStatus = typeof DISC_REVIEW_STATUSES[number];

/** Etiquetas de las salidas categóricas y binarias, por tipo de hallazgo. */
const PFIRRMANN_LABELS = ["I", "II", "III", "IV", "V"] as const;
const MODIC_LABELS = ["none", "I", "II", "III"] as const;
const BINARY_LABELS = ["absent", "present"] as const;

export function labelsFor(findingType: DiscFindingType): readonly string[] {
  if (findingType === "pfirrmann_grade") return PFIRRMANN_LABELS;
  if (findingType === "modic_change") return MODIC_LABELS;
  return BINARY_LABELS;
}

export const SCHEMA_VERSION = "pfi.disc-degenerative-findings.v1";

/**
 * Tolerancia de la suma de probabilidades.
 *
 * La misma que usa el contrato de P10.6: absorbe el redondeo de serializar floats, no una
 * distribución mal formada.
 */
const PROBABILITY_SUM_TOLERANCE = 0.02;

export type DiscFinding = {
  findingId: string;
  findingType: DiscFindingType;
  level: DiscLevel;
  label: string;
  probabilities: Record<string, number>;
  deploymentStatus: DeploymentStatus;
  /** Sobre qué se evaluó. Va a la vista: "interno" no es "validado externamente". */
  evaluationDataset: string;
  externalValidationAvailable: boolean;
  researchOnly: boolean;
  /** Si la localización anatómica automática está validada de punta a punta. */
  localizationValidated: boolean;
  modelId: string;
  reviewRequired: boolean;
  reviewStatus: DiscReviewStatus;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Las probabilidades de un hallazgo, o `null` si no forman una distribución.
 *
 * Se exigen **exactamente** las clases que el tipo de hallazgo declara: ni de menos —una
 * clase faltante deja un hueco que la barra dibujaría como cero— ni de más, porque una
 * clase que el catálogo no conoce significa que el contrato cambió y este código está
 * leyendo otra cosa.
 *
 * Una distribución rota no se normaliza para salvarla. Si el modelo no informó lo que dice
 * el contrato, corresponde no mostrar el hallazgo, no arreglarlo acá.
 */
export function parseDiscProbabilities(value: unknown, findingType: DiscFindingType): Record<string, number> | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const expected = labelsFor(findingType);
  if (Object.keys(raw).length !== expected.length) return null;

  const parsed: Record<string, number> = {};
  let total = 0;
  for (const label of expected) {
    const item = raw[label];
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1) return null;
    parsed[label] = item;
    total += item;
  }
  return Math.abs(total - 1) <= PROBABILITY_SUM_TOLERANCE ? parsed : null;
}

function parseReviewStatus(value: unknown): DiscReviewStatus {
  const status = text(value) as DiscReviewStatus;
  return DISC_REVIEW_STATUSES.includes(status) ? status : "pending";
}

export function parseDiscFinding(value: unknown): DiscFinding | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const findingId = text(raw.findingId);
  if (!findingId) return null;

  const findingType = text(raw.findingType) as DiscFindingType;
  if (!DISC_FINDING_TYPES.includes(findingType)) return null;

  const anatomy = asRecord(raw.anatomy) ?? {};
  const level = text(anatomy.level) as DiscLevel;
  if (!DISC_LEVELS.includes(level)) return null;

  const classification = asRecord(raw.classification) ?? {};
  const label = text(classification.label);
  if (!labelsFor(findingType).includes(label)) return null;
  const probabilities = parseDiscProbabilities(classification.probabilities, findingType);
  if (!probabilities) return null;
  // La etiqueta tiene que ser la clase más probable. Si no lo es, el hallazgo se
  // contradice a sí mismo y no hay forma de saber cuál de las dos creerle.
  const argmax = Object.keys(probabilities).reduce((a, b) => (probabilities[a] >= probabilities[b] ? a : b));
  if (label !== argmax) return null;

  const evidence = asRecord(raw.evidence) ?? {};
  const deploymentStatus = text(evidence.deploymentStatus) as DeploymentStatus;
  /*
   * Sin `deploymentStatus` no se muestra el hallazgo.
   *
   * No es un default que se pueda elegir: cualquiera de los tres valores sería una
   * afirmación sobre cuánto se validó la tarea. Suponer el más conservador escondería un
   * resultado bueno, y suponer el permisivo presentaría como respaldado algo que acierta
   * uno de cada cinco. Si el contrato no lo declara, este código no lo sabe.
   */
  if (!DEPLOYMENT_STATUSES.includes(deploymentStatus)) return null;

  const localization = asRecord(raw.localization) ?? {};
  const model = asRecord(raw.model) ?? {};
  const review = asRecord(raw.review) ?? {};

  return {
    findingId,
    findingType,
    level,
    label,
    probabilities,
    deploymentStatus,
    evaluationDataset: text(evidence.evaluationDataset),
    externalValidationAvailable: evidence.externalValidationAvailable === true,
    /*
     * Ausente se toma como `true`, igual que en P10.6.
     *
     * Es el único campo donde el default permisivo sería el inseguro: un hallazgo que no
     * declara su alcance no puede pasar por validado.
     */
    researchOnly: localization.researchOnly !== false,
    localizationValidated: localization.automaticAnatomicalLocalizationValidated === true,
    modelId: text(model.modelId),
    reviewRequired: review.required !== false,
    reviewStatus: parseReviewStatus(review.status),
  };
}

/**
 * Los hallazgos discales de una respuesta, descartando los que no cumplen el contrato.
 *
 * Devuelve lista vacía —y no lanza— cuando falta la versión de esquema o no es la
 * esperada. Una respuesta de otra versión no es un error de red ni algo que el médico
 * pueda resolver: es un desajuste entre este código y el módulo de IA, y lo que
 * corresponde es no mostrar nada.
 */
export function parseDiscDegenerativeFindings(value: unknown): DiscFinding[] {
  const raw = asRecord(value);
  if (!raw) return [];
  if (text(raw.schemaVersion) !== SCHEMA_VERSION) return [];
  const findings = raw.findings;
  if (!Array.isArray(findings)) return [];
  return findings
    .map(parseDiscFinding)
    .filter((finding): finding is DiscFinding => finding !== null);
}

/** Orden de lectura: por nivel de craneal a caudal, y dentro de cada nivel por tarea. */
export function sortDiscFindings(findings: DiscFinding[]): DiscFinding[] {
  return [...findings].sort((a, b) => {
    const byLevel = DISC_LEVELS.indexOf(a.level) - DISC_LEVELS.indexOf(b.level);
    if (byLevel !== 0) return byLevel;
    return DISC_FINDING_TYPES.indexOf(a.findingType) - DISC_FINDING_TYPES.indexOf(b.findingType);
  });
}

/** Los hallazgos de un nivel, para poder listarlos agrupados como pide el handoff. */
export function groupDiscFindingsByLevel(findings: DiscFinding[]): { level: DiscLevel; findings: DiscFinding[] }[] {
  const byLevel = new Map<DiscLevel, DiscFinding[]>();
  for (const finding of sortDiscFindings(findings)) {
    const bucket = byLevel.get(finding.level);
    if (bucket) bucket.push(finding);
    else byLevel.set(finding.level, [finding]);
  }
  // Se recorre el catálogo y no el mapa para que el orden sea anatómico y estable.
  return DISC_LEVELS
    .filter((level) => byLevel.has(level))
    .map((level) => ({ level, findings: byLevel.get(level) as DiscFinding[] }));
}
