import { API_BASE_URL } from "./api";
import { authHeaders } from "./authClient";
import type { PatientHistoryResponse, PatientStudy, Priority, ReviewStatus } from "./appTypes";

function mapPriority(value?: string): Priority {
  if (value === "alta" || value === "high") return "alta";
  if (value === "baja" || value === "low") return "baja";
  return "media";
}

function mapReviewStatus(value?: string): ReviewStatus {
  if (value === "aceptado" || value === "observado" || value === "descartado") return value;
  return "pendiente";
}

function metricNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeHistoryStudy(value: unknown, index: number): PatientStudy {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const metrics = record.metrics && typeof record.metrics === "object" ? record.metrics as Record<string, unknown> : {};
  return {
    caseId: typeof record.caseId === "string" ? record.caseId : `CASE-HISTORY-${index + 1}`,
    studyDate: typeof record.studyDate === "string" ? record.studyDate : "",
    planes: typeof record.planes === "string" ? record.planes : typeof record.plane === "string" ? record.plane : "sagittal",
    modelVersion: typeof record.modelVersion === "string" ? record.modelVersion : typeof record.modelKey === "string" ? record.modelKey : "sagittal_spider",
    reviewStatus: mapReviewStatus(typeof record.reviewStatus === "string" ? record.reviewStatus : undefined),
    priority: mapPriority(typeof record.priority === "string" ? record.priority : undefined),
    metrics: {
      lordosisAngle: metricNumber(metrics.lordosisAngle),
      canalDiameter: metricNumber(metrics.canalDiameter),
      averageDiscHeight: metricNumber(metrics.averageDiscHeight),
      l45DiscHeight: metricNumber(metrics.l45DiscHeight),
    },
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
      mostRecent: typeof summary.mostRecent === "string" ? summary.mostRecent : studies[0]?.studyDate,
      firstStudy: typeof summary.firstStudy === "string" ? summary.firstStudy : studies[studies.length - 1]?.studyDate,
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
  };
}
