import type { AiRunResponse, PersistedStudyRun, ReviewableRun, SelectedStudyReference, StudiesSummary, StudyDetailResponse, StudyRow } from "./appTypes";

export type ContractIssue = {
  message: string;
  code?: string;
  path?: string;
  traceId?: string;
};

export type DataStatus = "idle" | "loading" | "ready" | "empty" | "error";

export type BootstrapStatuses = {
  backendStatus: DataStatus;
  databaseDataStatus: DataStatus;
  aiModuleStatus: DataStatus;
  reviewSnapshotStatus: DataStatus;
};

function errorField(error: unknown, field: "code" | "path" | "traceId") {
  return error && typeof error === "object" && field in error && typeof (error as Record<string, unknown>)[field] === "string"
    ? (error as Record<string, string>)[field]
    : undefined;
}

export function toContractIssue(error: unknown): ContractIssue {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : undefined;
  return {
    message: error instanceof Error ? error.message : typeof record?.message === "string" ? record.message : "Respuesta incompatible con el contrato.",
    code: errorField(error, "code"),
    path: errorField(error, "path"),
    traceId: errorField(error, "traceId"),
  };
}

export function normalizeSelectedRunForReview(
  selectedRun: AiRunResponse | null,
  isDemo: boolean,
  normalizeRealRun: (run: AiRunResponse) => AiRunResponse,
): { safeRun: AiRunResponse | null; contractIssue: ContractIssue | null } {
  if (!selectedRun) return { safeRun: null, contractIssue: null };
  if (isDemo) return { safeRun: selectedRun, contractIssue: null };
  try {
    return { safeRun: normalizeRealRun(selectedRun), contractIssue: null };
  } catch (error) {
    return { safeRun: null, contractIssue: toContractIssue(error) };
  }
}

export function mergeStudyRowsWithSelectedRun(rows: StudyRow[], safeRun: AiRunResponse | null): StudyRow[] {
  if (!safeRun?.runId) return rows;
  return rows.map((row) => {
    if (row.runId !== safeRun.runId) return row;
    return {
      ...row,
      caseId: safeRun.caseId ?? row.caseId,
      plane: safeRun.plane ?? row.plane,
      modelKey: safeRun.modelKey ?? row.modelKey,
      modelStatus: safeRun.measurementsStatus === "pending_real_inference" ? "Pipeline tecnico / inferencia pendiente" : safeRun.degradedMode ? "Modo degradado" : row.modelStatus,
      reviewStatus: safeRun.review?.status ?? row.reviewStatus,
      priority: safeRun.agentDecision?.priority ?? row.priority,
    };
  });
}

export function toSelectedStudyReference(study: StudyRow): SelectedStudyReference {
  return { caseId: study.caseId, patientId: study.patientId, studyDate: study.studyDate };
}

export function shouldFetchSubjectHistory(subjectRef: string | null | undefined) {
  return typeof subjectRef === "string" && subjectRef.trim().length > 0;
}

export function selectReviewableRunFromDetail(detail: StudyDetailResponse): ReviewableRun | null {
  const firstRun = detail.runs?.[0] as PersistedStudyRun | undefined;
  if (!firstRun) return null;
  return {
    runId: firstRun.runId,
    caseId: detail.study.caseId,
    patientId: detail.study.patientId,
    studyDate: detail.study.studyDate,
    plane: firstRun.plane,
    modelKey: firstRun.modelKey,
    review: detail.review,
    reviewStatus: firstRun.reviewStatus,
    humanReviewRequired: detail.humanReviewRequired ?? true,
    notClinicalDiagnosis: detail.notClinicalDiagnosis ?? true,
    dataOrigin: "backend",
  };
}

export function deriveSummary(items: StudyRow[]): StudiesSummary {
  return {
    total: items.length,
    pending: items.filter((item) => item.reviewStatus === "pendiente" || item.reviewStatus === "observado").length,
    completed: items.filter((item) => item.reviewStatus === "aceptado").length,
    flagged: items.filter((item) => item.priority === "alta" || item.reviewStatus === "observado").length,
  };
}
