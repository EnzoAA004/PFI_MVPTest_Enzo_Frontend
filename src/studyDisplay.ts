import type { Plane } from "./appTypes";

export function displaySubjectRef(value: string | null | undefined) {
  return value && value.trim() ? value : "Sin referencia deidentificada";
}

export function displayStudyDate(value: string | null | undefined) {
  return value && value.trim() ? value : "Fecha no informada";
}

export function displayModelKey(value: string | null | undefined) {
  return value && value.trim() ? value : "Sin modelo ejecutado";
}

export function displayPrimaryPlane(value: Plane | null | undefined) {
  if (value === "sagittal") return "sagittal";
  if (value === "axial") return "axial";
  return "Sin plano procesado";
}

export function displayLatestRunId(value: string | null | undefined) {
  return value && value.trim() ? value : "Sin corrida";
}

export function studyHasReviewableRun(value: { latestRunId?: string | null; runId?: string | null }) {
  return Boolean((value.latestRunId ?? value.runId)?.trim());
}
