import { API_BASE_URL } from "./api";
import { authHeaders } from "./authClient";
import type { Measurement, PatientHistoryResponse, PatientStudy, PersistedReviewCorrection, Plane, Priority, ReviewStatus } from "./appTypes";
import { applyCorrectionsToMeasurements, normalizePersistedCorrection } from "./studyApi";

function mapPriority(value?: string): Priority {
  if (value === "alta" || value === "high") return "alta";
  if (value === "baja" || value === "low") return "baja";
  return "media";
}

function mapReviewStatus(value?: string): ReviewStatus {
  if (value === "accepted") return "aceptado";
  if (value === "observed" || value === "edited") return "observado";
  if (value === "rejected") return "descartado";
  if (value === "aceptado" || value === "observado" || value === "descartado") return value;
  return "pendiente";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function mapPlane(value: unknown): Plane | undefined {
  return value === "sagittal" || value === "axial" ? value : undefined;
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function normalizePlanes(value: unknown): string {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string").join(", ");
  return typeof value === "string" ? value : "";
}

function normalizeMeasurement(value: unknown, index: number, plane: Plane): Measurement | null {
  const item = asRecord(value);
  if (!item) return null;
  const id = optionalString(item, "id") ?? optionalString(item, "measurementId") ?? `${plane}-measurement-${index + 1}`;
  const label = optionalString(item, "label") ?? optionalString(item, "name") ?? "Medición técnica";
  const rawValue = item.value;
  const aiValue = item.aiValue ?? rawValue;
  const reviewerValue = item.reviewerValue;
  if (typeof rawValue !== "number" && typeof rawValue !== "string" && typeof aiValue !== "number" && typeof aiValue !== "string") return null;
  return {
    id,
    label,
    value: typeof reviewerValue === "number" || typeof reviewerValue === "string" ? reviewerValue : typeof rawValue === "number" || typeof rawValue === "string" ? rawValue : aiValue as number | string,
    aiValue: typeof aiValue === "number" || typeof aiValue === "string" ? aiValue : undefined,
    reviewerValue: typeof reviewerValue === "number" || typeof reviewerValue === "string" || reviewerValue === null ? reviewerValue : undefined,
    unit: optionalString(item, "unit") ?? "",
    confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    plane: mapPlane(item.plane) ?? plane,
    source: reviewerValue === undefined || reviewerValue === null ? "AI" : "Reviewer",
    status: reviewerValue === undefined || reviewerValue === null ? "pendiente" : "editado",
    outlier: Boolean(item.outlier),
    dataOrigin: "database",
  };
}

function normalizeMeasurementsByPlane(value: unknown): Partial<Record<Plane, Measurement[]>> {
  const record = asRecord(value);
  if (!record) return {};
  const result: Partial<Record<Plane, Measurement[]>> = {};
  for (const plane of ["sagittal", "axial"] as const) {
    const rows = record[plane];
    if (!Array.isArray(rows)) continue;
    result[plane] = rows.flatMap((row, index) => {
      const measurement = normalizeMeasurement(row, index, plane);
      return measurement ? [measurement] : [];
    });
  }
  return result;
}

function normalizeCorrections(value: unknown): PersistedReviewCorrection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const correction = normalizePersistedCorrection(entry, index);
    return correction ? [correction] : [];
  });
}

function normalizeHistoryStudy(value: unknown, index: number): PatientStudy {
  const record = asRecord(value) ?? {};
  const caseId = optionalString(record, "caseId");
  if (!caseId) throw new Error(`Historial inválido: falta caseId en estudio ${index + 1}`);
  const corrections = normalizeCorrections(record.corrections);
  const measurementsByPlane = applyCorrectionsToMeasurements(normalizeMeasurementsByPlane(record.measurementsByPlane), corrections);
  return {
    caseId,
    subjectRef: optionalString(record, "subjectRef"),
    studyDate: optionalString(record, "studyDate"),
    modality: optionalString(record, "modality"),
    description: optionalString(record, "description"),
    planes: normalizePlanes(record.planes ?? record.plane),
    modelVersion: optionalString(record, "modelVersion") ?? optionalString(record, "modelKey") ?? "",
    modelKey: optionalString(record, "modelKey"),
    latestRunId: optionalString(record, "latestRunId") ?? optionalString(record, "runId"),
    reviewStatus: mapReviewStatus(optionalString(record, "reviewStatus") ?? undefined),
    priority: mapPriority(typeof record.priority === "string" ? record.priority : undefined),
    reviewer: optionalString(record, "reviewer"),
    reviewedAt: optionalString(record, "reviewedAt"),
    measurementsByPlane,
    corrections,
    createdAt: optionalString(record, "createdAt") || undefined,
    updatedAt: optionalString(record, "updatedAt") || undefined,
  };
}

export async function fetchSubjectHistory(subjectRef: string): Promise<PatientHistoryResponse> {
  const response = await fetch(`${API_BASE_URL}/api/subjects/${encodeURIComponent(subjectRef)}/history`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const studies = Array.isArray(payload.studies) ? payload.studies.map(normalizeHistoryStudy) : [];
  const summary = payload.summary && typeof payload.summary === "object" ? payload.summary as Record<string, unknown> : {};
  const governance = payload.governance && typeof payload.governance === "object" ? payload.governance as Record<string, unknown> : {};
  return {
    status: typeof payload.status === "string" ? payload.status : "ok",
    source: typeof payload.source === "string" ? payload.source : "frontend-subject-history",
    subjectRef: typeof payload.subjectRef === "string" ? payload.subjectRef : subjectRef,
    deidentified: Boolean(payload.deidentified ?? true),
    studies,
    summary: {
      totalStudies: typeof summary.totalStudies === "number" ? summary.totalStudies : studies.length,
      mostRecent: typeof summary.mostRecent === "string" ? summary.mostRecent : studies[0]?.studyDate || undefined,
      firstStudy: typeof summary.firstStudy === "string" ? summary.firstStudy : studies[studies.length - 1]?.studyDate || undefined,
      pending: typeof summary.pending === "number" ? summary.pending : studies.filter((study) => study.reviewStatus === "pendiente").length,
      completed: typeof summary.completed === "number" ? summary.completed : studies.filter((study) => study.reviewStatus === "aceptado").length,
      observed: typeof summary.observed === "number" ? summary.observed : studies.filter((study) => study.reviewStatus === "observado").length,
      withStudyDate: typeof summary.withStudyDate === "number" ? summary.withStudyDate : studies.filter((study) => Boolean(study.studyDate)).length,
    },
    governance: {
      dataScope: typeof governance.dataScope === "string" ? governance.dataScope : "academic-deidentified",
      rawImagesExport: typeof governance.rawImagesExport === "string" ? governance.rawImagesExport : "not_permitted",
      derivedMetricsExport: typeof governance.derivedMetricsExport === "string" ? governance.derivedMetricsExport : "permitted",
      humanReviewRequired: Boolean(governance.humanReviewRequired ?? payload.humanReviewRequired ?? true),
      notClinicalDiagnosis: Boolean(governance.notClinicalDiagnosis ?? payload.notClinicalDiagnosis ?? true),
    },
    humanReviewRequired: Boolean(payload.humanReviewRequired ?? true),
    notClinicalDiagnosis: Boolean(payload.notClinicalDiagnosis ?? true),
    dataOrigin: "database",
  };
}
