import type { Plane } from "./appTypes";
import { displayModelStatus as displayClinicalModelStatus, displayPlane } from "./clinicalDisplay";

export function displaySubjectRef(value: string | null | undefined) {
  return value && value.trim() ? value : "Referencia de paciente no informada";
}

export function displayStudyDate(value: string | null | undefined) {
  return value && value.trim() ? value : "Fecha no informada";
}

export function displayModelKey(value: string | null | undefined) {
  return value && value.trim() ? value : "Sin modelo ejecutado";
}

export function displayPrimaryPlane(value: Plane | null | undefined) {
  return displayPlane(value);
}

export function displayLatestRunId(value: string | null | undefined) {
  return value && value.trim() ? value : "Sin corrida";
}

export function displayModelStatus(value: string | null | undefined) {
  return displayClinicalModelStatus(value);
}

export function studyHasReviewableRun(value: { latestRunId?: string | null; runId?: string | null }) {
  return Boolean((value.latestRunId ?? value.runId)?.trim());
}
