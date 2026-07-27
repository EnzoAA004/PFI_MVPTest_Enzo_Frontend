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
  "disc_group area": "Área del grupo de discos intervertebrales",
  "disc_group width": "Ancho del grupo de discos intervertebrales",
  "disc_group height": "Altura del grupo de discos intervertebrales",
};

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

export function displayLandmarkLabel(value: string | null | undefined) {
  if (!value) return "Punto de referencia";
  return readableFallback(value);
}

export function displayMeasurementLevel(value: string | null | undefined) {
  if (!value || value === "Nivel no informado") return "Nivel no informado";
  return readableFallback(value);
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
