import { API_BASE_URL, ApiError, ContractError } from "./api";
import { authHeaders } from "./authClient";
import type { Measurement, Plane, Priority, ReviewStatus, ReviewStatusResponse, StudyDetailResponse, StudyRow, StudyRun } from "./appTypes";

function mapPriority(value?: string): Priority {
  if (value === "alta" || value === "high") return "alta";
  if (value === "baja" || value === "low") return "baja";
  return "media";
}

function mapStatus(value?: string): ReviewStatus {
  if (value === "aceptado" || value === "observado" || value === "descartado") return value;
  return "pendiente";
}

function mapPlane(value: unknown): Plane | undefined {
  return value === "axial" || value === "sagittal" ? value : undefined;
}

function protectedHeaders() {
  return { "Content-Type": "application/json", ...authHeaders() };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function requireString(record: Record<string, unknown>, key: string, context: string) {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new ContractError(`Contrato incompleto en ${context}: falta ${key}.`, context);
  return value;
}

function normalizeStudy(value: unknown): StudyRow {
  const row = asRecord(value);
  if (!row) throw new ContractError("Detalle de estudio invalido.", "/api/studies/{caseId}");
  const plane = mapPlane(row.plane);
  if (!plane) throw new ContractError("Detalle de estudio sin plano valido.", "/api/studies/{caseId}");
  return {
    caseId: requireString(row, "caseId", "/api/studies/{caseId}"),
    patientId: typeof row.patientId === "string" ? row.patientId : typeof row.subjectRef === "string" ? row.subjectRef : requireString(row, "patientId", "/api/studies/{caseId}"),
    plane,
    studyDate: requireString(row, "studyDate", "/api/studies/{caseId}"),
    modelKey: requireString(row, "modelKey", "/api/studies/{caseId}"),
    modelStatus: typeof row.modelStatus === "string" ? row.modelStatus : "sin_estado",
    reviewStatus: mapStatus(typeof row.reviewStatus === "string" ? row.reviewStatus : undefined),
    priority: mapPriority(typeof row.priority === "string" ? row.priority : undefined),
    runId: typeof row.runId === "string" ? row.runId : undefined,
    dataOrigin: "backend",
  };
}

function normalizeRun(value: unknown, study: StudyRow): StudyRun {
  const run = asRecord(value);
  if (!run) throw new ContractError("Corrida de estudio invalida.", "/api/studies/{caseId}/runs");
  const plane = mapPlane(run.plane ?? study.plane);
  if (!plane) throw new ContractError("Corrida sin plano valido.", "/api/studies/{caseId}/runs");
  return {
    runId: requireString(run, "runId", "/api/studies/{caseId}/runs"),
    caseId: typeof run.caseId === "string" ? run.caseId : study.caseId,
    plane,
    modelKey: typeof run.modelKey === "string" ? run.modelKey : study.modelKey,
    modelStatus: typeof run.modelStatus === "string" ? run.modelStatus : study.modelStatus,
    reviewStatus: mapStatus(typeof run.reviewStatus === "string" ? run.reviewStatus : study.reviewStatus),
    measurementCount: typeof run.measurementCount === "number" ? run.measurementCount : undefined,
  };
}

function normalizeMeasurement(value: unknown, index: number): Measurement {
  const item = asRecord(value);
  if (!item) throw new ContractError(`Medicion invalida en posicion ${index}.`, "/api/studies/{caseId}");
  return {
    id: typeof item.id === "string" ? item.id : `measurement-${index}`,
    label: typeof item.label === "string" ? item.label : "Medicion revisable",
    value: typeof item.value === "number" || typeof item.value === "string" ? item.value : "",
    unit: typeof item.unit === "string" ? item.unit : "",
    confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    plane: mapPlane(item.plane),
    source: item.source === "Reviewer" || item.source === "Placeholder" ? item.source : "AI",
    status: item.status === "revisado" || item.status === "editado" ? item.status : "pendiente",
    outlier: Boolean(item.outlier),
    dataOrigin: "backend",
  };
}

async function readJson(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: protectedHeaders() });
  if (!response.ok) throw new ApiError(`Backend respondio ${response.status}`, { status: response.status, path });
  return await response.json() as Record<string, unknown>;
}

export async function fetchStudyDetail(study: StudyRow): Promise<StudyDetailResponse> {
  const payload = await readJson(`/api/studies/${study.caseId}`);
  const normalizedStudy = normalizeStudy(payload.study ?? study);
  const runs = Array.isArray(payload.runs) ? payload.runs.map((run) => normalizeRun(run, normalizedStudy)) : [];
  const review = payload.review && typeof payload.review === "object" ? payload.review as ReviewStatusResponse : undefined;
  const measurements = Array.isArray(payload.measurements) ? payload.measurements.map(normalizeMeasurement) : [];
  return {
    status: "ok",
    study: normalizedStudy,
    runs,
    review,
    measurements,
    humanReviewRequired: payload.humanReviewRequired === undefined ? true : Boolean(payload.humanReviewRequired),
    notClinicalDiagnosis: payload.notClinicalDiagnosis === undefined ? true : Boolean(payload.notClinicalDiagnosis),
    dataOrigin: "backend",
  };
}

export async function fetchStudyRuns(study: StudyRow): Promise<StudyRun[]> {
  const payload = await readJson(`/api/studies/${study.caseId}/runs`);
  return Array.isArray(payload.runs) ? payload.runs.map((run) => normalizeRun(run, study)) : [];
}
