import { API_BASE_URL } from "./api";
import type { Measurement, Plane, Priority, ReviewStatus, ReviewStatusResponse, StudyDetailResponse, StudyRow, StudyRun } from "./appTypes";
import { worklistStudies } from "./data/mockStudies";
import { mockMeasurements } from "./data/mockMeasurements";

function mapPriority(value?: string): Priority {
  if (value === "alta" || value === "high") return "alta";
  if (value === "baja" || value === "low") return "baja";
  return "media";
}

function mapStatus(value?: string): ReviewStatus {
  if (value === "aceptado" || value === "observado" || value === "descartado") return value;
  return "pendiente";
}

function mapPlane(value: unknown): Plane {
  return value === "axial" ? "axial" : "sagittal";
}

function normalizeStudy(value: unknown, index = 0): StudyRow {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fallback = worklistStudies[index] ?? worklistStudies[0];
  return {
    caseId: typeof row.caseId === "string" ? row.caseId : fallback.caseId,
    patientId: typeof row.patientId === "string" ? row.patientId : typeof row.subjectRef === "string" ? row.subjectRef : fallback.patientId,
    plane: mapPlane(row.plane),
    studyDate: typeof row.studyDate === "string" ? row.studyDate : fallback.studyDate,
    modelKey: typeof row.modelKey === "string" ? row.modelKey : fallback.modelKey,
    modelStatus: typeof row.modelStatus === "string" ? row.modelStatus : fallback.modelStatus,
    reviewStatus: mapStatus(typeof row.reviewStatus === "string" ? row.reviewStatus : fallback.reviewStatus),
    priority: mapPriority(typeof row.priority === "string" ? row.priority : fallback.priority),
    runId: typeof row.runId === "string" ? row.runId : fallback.runId,
  };
}

function normalizeRun(value: unknown, fallback: StudyRow): StudyRun {
  const run = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    runId: typeof run.runId === "string" ? run.runId : fallback.runId ?? "demo-run",
    caseId: typeof run.caseId === "string" ? run.caseId : fallback.caseId,
    plane: mapPlane(run.plane ?? fallback.plane),
    modelKey: typeof run.modelKey === "string" ? run.modelKey : fallback.modelKey,
    modelStatus: typeof run.modelStatus === "string" ? run.modelStatus : fallback.modelStatus,
    reviewStatus: mapStatus(typeof run.reviewStatus === "string" ? run.reviewStatus : fallback.reviewStatus),
    measurementCount: typeof run.measurementCount === "number" ? run.measurementCount : undefined,
  };
}

function normalizeMeasurement(value: unknown, index: number): Measurement {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: typeof item.id === "string" ? item.id : `measurement-${index}`,
    label: typeof item.label === "string" ? item.label : "Medicion revisable",
    value: typeof item.value === "number" || typeof item.value === "string" ? item.value : "",
    unit: typeof item.unit === "string" ? item.unit : "",
    confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    plane: item.plane === "axial" || item.plane === "sagittal" ? item.plane : undefined,
    source: item.source === "Reviewer" || item.source === "Placeholder" ? item.source : "AI",
    status: item.status === "revisado" || item.status === "editado" ? item.status : "pendiente",
    outlier: Boolean(item.outlier),
  };
}

export async function fetchStudyDetail(study: StudyRow): Promise<StudyDetailResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/studies/${study.caseId}`);
    if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    const normalizedStudy = normalizeStudy(payload.study ?? study);
    const runs = Array.isArray(payload.runs) ? payload.runs.map((run) => normalizeRun(run, normalizedStudy)) : [normalizeRun({}, normalizedStudy)];
    const runId = runs[0]?.runId ?? normalizedStudy.runId ?? "demo-run";
    const review = payload.review && typeof payload.review === "object" ? payload.review as ReviewStatusResponse : { runId, status: normalizedStudy.reviewStatus };
    const measurements = Array.isArray(payload.measurements) ? payload.measurements.map(normalizeMeasurement) : [];
    return { status: "ok", study: normalizedStudy, runs, review: { ...review, runId }, measurements, humanReviewRequired: true, notClinicalDiagnosis: true };
  } catch {
    return { status: "demo", study, runs: [normalizeRun({}, study)], review: { runId: study.runId, status: study.reviewStatus }, measurements: mockMeasurements, humanReviewRequired: true, notClinicalDiagnosis: true };
  }
}

export async function fetchStudyRuns(study: StudyRow): Promise<StudyRun[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/studies/${study.caseId}/runs`);
    if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
    const payload = await response.json() as { runs?: unknown[] };
    return Array.isArray(payload.runs) ? payload.runs.map((run) => normalizeRun(run, study)) : [];
  } catch {
    return [normalizeRun({}, study)];
  }
}
