import type { Plane, ReviewStatus } from "./appTypes";

const reviewStatusLabels: Record<ReviewStatus | "pending" | "accepted" | "observed" | "rejected" | "edited", string> = {
  pendiente: "Pendiente",
  aceptado: "Finalizado",
  observado: "Observado",
  descartado: "Descartado",
  pending: "Pendiente",
  accepted: "Finalizado",
  observed: "Observado",
  rejected: "Descartado",
  edited: "Observado",
};

const planeLabels: Record<Plane, string> = {
  sagittal: "Sagital",
  axial: "Axial",
};

const inferenceModeLabels: Record<string, string> = {
  real_baseline: "Inferencia real de referencia",
  real: "Inferencia real",
  contract: "Modo de contrato",
  mock: "Modo demo",
  fallback: "Modo fallback",
};

const modelStatusLabels: Record<string, string> = {
  completed: "Procesamiento completado",
  pending: "Pendiente",
  processing: "Procesando",
  failed: "Error de procesamiento",
  candidate_below_quality_gate: "Candidato por debajo del umbral de calidad",
};

const technicalReadinessLabels: Record<string, string> = {
  real_artifact_available: "Artifact real disponible",
  contract_only_missing_artifact: "Modo de contrato: falta artifact",
  candidate_below_quality_gate: "Candidato por debajo del umbral de calidad",
  real_baseline_ready: "Inferencia real de referencia disponible",
};

const measurementLabels: Record<string, string> = {
  "vertebra_group area": "Área del grupo vertebral",
  "vertebra_group width": "Ancho del grupo vertebral",
  "vertebra_group height": "Altura del grupo vertebral",
  "canal area": "Área del canal espinal",
  "canal width": "Ancho del canal espinal",
  "canal height": "Altura del canal espinal",
  "canal ap": "Diámetro anteroposterior del canal",
  "vertebra area": "Área del cuerpo vertebral",
  "vertebra width": "Ancho del cuerpo vertebral",
  "vertebra height": "Altura del cuerpo vertebral",
  "disc area": "Área del disco intervertebral",
  "disc width": "Ancho del disco intervertebral",
  "disc height": "Altura del disco intervertebral",
  "disc_group area": "Área del grupo de discos intervertebrales",
  "disc_group width": "Ancho del grupo de discos intervertebrales",
  "disc_group height": "Altura del grupo de discos intervertebrales",
};

/**
 * Short forms for dense tables, where the full label does not fit in a column.
 * The structure is already implied by the row grouping, so only the magnitude
 * needs to be spelled out.
 */
const measurementShortLabels: Record<string, string> = {
  "vertebra_group area": "Área vertebral",
  "vertebra_group width": "Ancho vertebral",
  "vertebra_group height": "Altura vertebral",
  "canal area": "Área canal",
  "canal width": "Ancho canal",
  "canal height": "Altura canal",
  "canal ap": "Canal AP",
  "vertebra area": "Área vertebral",
  "vertebra width": "Ancho vertebral",
  "vertebra height": "Altura vertebral",
  "disc area": "Área discal",
  "disc width": "Ancho discal",
  "disc height": "Altura discal",
  "disc_group area": "Área discal",
  "disc_group width": "Ancho discal",
  "disc_group height": "Altura discal",
};

/** Segmentation class keys emitted by the sagittal model. */
const structureLabels: Record<string, string> = {
  /*
   * Clases del modelo axial (dataset Al-Kafri).
   *
   * Las claves son los valores de gris de la máscara original, no nombres: así los
   * declara el manifest del artefacto, y el AI Module los deja tal cual para que
   * código y artefacto digan lo mismo sobre lo que se entrenó. La traducción
   * clínica es cosa de esta capa, igual que con las clases del sagital.
   */
  raw_50: "Disco intervertebral",
  raw_100: "Elemento posterior",
  raw_150: "Saco tecal",
  raw_200: "Área anteroposterior",
  vertebra_group: "Grupo vertebral",
  /*
   * Estructuras que el AI Module separa dentro de `vertebra_group`. La clase del
   * modelo no las distingue, pero en un sagital el cuerpo y el arco son piezas
   * distintas de la misma vértebra y nombrarlas por igual escondía esa diferencia.
   */
  vertebra: "Cuerpo vertebral",
  posterior_element: "Arco posterior",
  disc: "Disco",
  canal: "Canal espinal",
  disc_group: "Grupo discal",
  background: "Fondo",
};

const landmarkLabels: Record<string, string> = {
  vertebra_group_centroid: "Centroide del grupo vertebral",
  canal_centroid: "Centroide del canal espinal",
  disc_group_centroid: "Centroide del grupo discal",
};

/**
 * Lumbar levels in reading order. A lumbar MRI is read and reported level by
 * level, so this is the fixed spine of the findings panel — the list is always
 * rendered complete, including levels with no finding.
 */
export const LUMBAR_LEVELS = ["L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"] as const;

/**
 * Thoracic levels a lumbar study reaches when the field of view extends upwards,
 * ordered downwards so they sit above L1-L2 in the panel.
 *
 * They are not part of the fixed spine: a lumbar protocol is read L1-L2 through
 * L5-S1, and showing an empty T9-T10 row on every study would state that a level
 * was looked at and found clean when it was never in frame. They appear only when
 * the study actually has them.
 */
export const THORACIC_LEVELS = ["T8-T9", "T9-T10", "T10-T11", "T11-T12", "T12-L1"] as const;

export type LumbarLevel = (typeof LUMBAR_LEVELS)[number];
export type ThoracicLevel = (typeof THORACIC_LEVELS)[number];
export type SpineLevel = LumbarLevel | ThoracicLevel;

const KNOWN_LEVELS: readonly string[] = [...THORACIC_LEVELS, ...LUMBAR_LEVELS];

/**
 * Accepts l4_l5 / L4L5 / l4-l5 / "L4 L5" and normalizes to the canonical "L4-L5".
 *
 * Thoracic levels are accepted too. While only the lumbar table was, a level the AI
 * had correctly identified as T12-L1 landed in the unassigned bucket, which reads as
 * "the AI could not tell" when in fact it could.
 */
export function normalizeLevel(value: string | null | undefined): SpineLevel | null {
  if (!value) return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^([LST]\d{1,2})([LST]\d{1,2})$/);
  const candidate = match ? `${match[1]}-${match[2]}` : value.toUpperCase().trim();
  return KNOWN_LEVELS.includes(candidate) ? (candidate as SpineLevel) : null;
}

const modalityLabels: Record<string, string> = {
  MRI: "Resonancia magnética",
};

const reviewPriorityLabels: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

function readableFallback(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function displayPlane(value: Plane | string | null | undefined) {
  if (value === "sagittal" || value === "axial") return planeLabels[value];
  return value && value.trim() ? readableFallback(value) : "Sin plano procesado";
}

export function displayReviewStatus(value: ReviewStatus | string | null | undefined) {
  if (!value) return "Pendiente";
  return reviewStatusLabels[value as keyof typeof reviewStatusLabels] ?? readableFallback(value);
}

export function displayModelStatus(value: string | null | undefined) {
  if (!value) return "Sin estado del modelo";
  return modelStatusLabels[value] ?? readableFallback(value);
}

export function displayInferenceMode(value: string | null | undefined) {
  if (!value) return "Sin datos";
  return inferenceModeLabels[value] ?? readableFallback(value);
}

export function displayMeasurementLabel(value: string | null | undefined) {
  if (!value) return "Medición";
  return measurementLabels[value] ?? readableFallback(value);
}

/**
 * Clave de medición a partir del id canónico, para corridas persistidas sin
 * `labelKey`.
 *
 * El AI Module arma el id como `{plano}-{clase}-{métrica}`
 * (`sagittal-vertebra_group-area`), que es la misma información que labelKey
 * ("vertebra_group area"): no se adivina el nombre clínico, se lo lee del
 * identificador que ya lo contiene. Si el id no tiene esa forma, o la clave
 * resultante no está en el diccionario, devuelve undefined y quien llame usa su
 * rótulo genérico en vez de inventar una estructura anatómica.
 */
export function measurementKeyFromId(id: unknown): string | undefined {
  const parts = String(id ?? "").split("-");
  if (parts.length < 3) return undefined;
  const key = `${parts.slice(1, -1).join("-")} ${parts.at(-1)}`;
  return key in measurementLabels ? key : undefined;
}

/** Rótulo de una medición según lo que la corrida haya informado. */
export function resolveMeasurementLabel(item: { label?: unknown; labelKey?: unknown; id?: unknown }) {
  if (typeof item.label === "string" && item.label.trim()) return item.label.trim();
  if (typeof item.labelKey === "string" && item.labelKey.trim()) return item.labelKey.trim();
  return measurementKeyFromId(item.id) ?? "Medición revisable";
}

export function displayMeasurementLabelShort(value: string | null | undefined) {
  if (!value) return "Medición";
  return measurementShortLabels[value] ?? displayMeasurementLabel(value);
}

export function displayStructureLabel(value: string | null | undefined) {
  if (!value) return "Estructura";
  return structureLabels[value] ?? readableFallback(value);
}

export function displayLandmarkLabel(value: string | null | undefined) {
  if (!value) return "Punto de referencia";
  return landmarkLabels[value] ?? readableFallback(value);
}

export function displayMeasurementLevel(value: string | null | undefined) {
  if (!value || value === "Nivel no informado") return "Nivel no informado";
  return normalizeLevel(value) ?? readableFallback(value);
}

export function displayTechnicalReadiness(value: string | null | undefined) {
  if (!value) return "Sin datos";
  return technicalReadinessLabels[value] ?? readableFallback(value);
}

export function displayUnit(value: string | null | undefined) {
  if (value === "mm2") return "mm²";
  return value && value.trim() ? value : "";
}

export function displayModality(value: string | null | undefined) {
  if (!value) return "No informada";
  return modalityLabels[value] ?? readableFallback(value);
}

export function displayReviewPriority(value: string | null | undefined) {
  if (!value) return "Media";
  return reviewPriorityLabels[value] ?? readableFallback(value);
}
