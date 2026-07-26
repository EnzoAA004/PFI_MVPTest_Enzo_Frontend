import { API_BASE_URL, ApiError, ContractError } from "./api";
import { authHeaders } from "./authClient";
import type { DataOrigin, Measurement, PersistedArtifact, Plane, Priority, ReviewStatus, ReviewStatusResponse, StudyDetailResponse, StudyRow, StudyRun } from "./appTypes";

function mapPriority(value?: string): Priority {
  if (value === "alta" || value === "high") return "alta";
  if (value === "baja" || value === "low") return "baja";
  return "media";
}

function mapStatus(value?: string): ReviewStatus {
  if (value === "accepted") return "aceptado";
  if (value === "observed" || value === "edited") return "observado";
  if (value === "rejected") return "descartado";
  if (value === "aceptado" || value === "observado" || value === "descartado") return value;
  return "pendiente";
}

function mapPlane(value: unknown): Plane | undefined {
  return value === "axial" || value === "sagittal" ? value : undefined;
}

function mapDataOrigin(value: unknown, fallback: DataOrigin): DataOrigin {
  return value === "backend" || value === "ai_module" || value === "database" || value === "demo" ? value : fallback;
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

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function normalizePlanes(value: unknown): Plane[] {
  if (!Array.isArray(value)) return [];
  return value.map(mapPlane).filter((plane): plane is Plane => Boolean(plane));
}

function normalizeStudy(value: unknown, fallback?: Partial<StudyRow>): StudyRow {
  const row = asRecord(value);
  if (!row) throw new ContractError("Detalle de estudio invalido.", "/api/studies/{caseId}");
  const subjectRef = optionalString(row, "subjectRef") ?? optionalString(row, "patientId");
  const primaryPlane = mapPlane(row.primaryPlane) ?? mapPlane(row.plane) ?? null;
  const planes = normalizePlanes(row.planes);
  const latestRunId = optionalString(row, "latestRunId") ?? optionalString(row, "runId");
  return {
    caseId: requireString(row, "caseId", "/api/studies/{caseId}"),
    subjectRef,
    patientId: subjectRef,
    studyDate: optionalString(row, "studyDate"),
    status: typeof row.status === "string" ? row.status : fallback?.status ?? "created",
    planes,
    primaryPlane,
    plane: primaryPlane,
    latestRunId,
    runId: latestRunId,
    modelKey: optionalString(row, "modelKey"),
    modelStatus: typeof row.modelStatus === "string" ? row.modelStatus : fallback?.modelStatus ?? "sin_estado",
    reviewStatus: mapStatus(typeof row.reviewStatus === "string" ? row.reviewStatus : fallback?.reviewStatus),
    priority: mapPriority(typeof row.priority === "string" ? row.priority : fallback?.priority),
    createdAt: typeof row.createdAt === "string" ? row.createdAt : fallback?.createdAt,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : fallback?.updatedAt,
    dataOrigin: mapDataOrigin(row.dataOrigin, fallback?.dataOrigin ?? "database"),
  };
}

function normalizeMeasurement(value: unknown, index: number, plane?: Plane): Measurement {
  const item = asRecord(value);
  if (!item) throw new ContractError(`Medicion invalida en posicion ${index}.`, "/api/studies/{caseId}");
  const aiValue = typeof item.aiValue === "number" || typeof item.aiValue === "string"
    ? item.aiValue
    : typeof item.value === "number" || typeof item.value === "string"
      ? item.value
      : "";
  const reviewerValue = typeof item.reviewerValue === "number" || typeof item.reviewerValue === "string" || item.reviewerValue === null ? item.reviewerValue : undefined;
  const effectiveValue = reviewerValue ?? (typeof item.value === "number" || typeof item.value === "string" ? item.value : aiValue);
  const linkedLandmarks = Array.isArray(item.linkedLandmarks) ? item.linkedLandmarks.filter((entry): entry is string => typeof entry === "string") : undefined;
  return {
    id: typeof item.id === "string" ? item.id : `measurement-${index}`,
    label: typeof item.label === "string" ? item.label : "Medicion revisable",
    value: effectiveValue,
    aiValue,
    reviewerValue,
    unit: typeof item.unit === "string" ? item.unit : "",
    confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    plane: mapPlane(item.plane) ?? plane,
    source: item.source === "Reviewer" || item.source === "Placeholder" ? item.source : "AI",
    status: item.status === "revisado" || item.status === "editado" ? item.status : "pendiente",
    outlier: Boolean(item.outlier),
    linkedLandmarks,
    dataOrigin: "database",
  };
}

function normalizeMeasurementsByPlane(value: unknown): Partial<Record<Plane, Measurement[]>> {
  const record = asRecord(value);
  if (!record) return {};
  const result: Partial<Record<Plane, Measurement[]>> = {};
  for (const plane of ["sagittal", "axial"] as const) {
    const values = record[plane];
    if (Array.isArray(values)) result[plane] = values.map((item, index) => normalizeMeasurement(item, index, plane));
  }
  return result;
}

function normalizeArtifactsByPlane(value: unknown): Partial<Record<Plane, PersistedArtifact[]>> {
  const record = asRecord(value);
  if (!record) return {};
  const result: Partial<Record<Plane, PersistedArtifact[]>> = {};
  for (const plane of ["sagittal", "axial"] as const) {
    const values = record[plane];
    if (!Array.isArray(values)) continue;
    result[plane] = values.map((item) => {
      const artifact = asRecord(item) ?? {};
      return {
        plane: mapPlane(artifact.plane) ?? plane,
        runId: typeof artifact.runId === "string" ? artifact.runId : undefined,
        assetName: typeof artifact.assetName === "string" ? artifact.assetName : undefined,
        contentType: typeof artifact.contentType === "string" ? artifact.contentType : undefined,
        proxyUrl: typeof artifact.proxyUrl === "string" ? artifact.proxyUrl : undefined,
        storageStatus: typeof artifact.storageStatus === "string" ? artifact.storageStatus : undefined,
        storageKind: typeof artifact.storageKind === "string" ? artifact.storageKind : undefined,
        sizeBytes: typeof artifact.sizeBytes === "number" ? artifact.sizeBytes : undefined,
        sha256: typeof artifact.sha256 === "string" ? artifact.sha256 : undefined,
        available: typeof artifact.available === "boolean" ? artifact.available : undefined,
        createdAt: typeof artifact.createdAt === "string" ? artifact.createdAt : undefined,
      };
    });
  }
  return result;
}

function normalizeRun(value: unknown, study: StudyRow): StudyRun {
  const rawRun = asRecord(value);
  if (!rawRun) throw new ContractError("Corrida de estudio invalida.", "/api/studies/{caseId}/runs");
  const run = asRecord(rawRun.summary) ?? rawRun;
  const planes = normalizePlanes(run.planes);
  const primaryPlane = mapPlane(run.primaryPlane) ?? mapPlane(run.plane) ?? planes[0] ?? null;
  const modelKey = optionalString(run, "modelKey") ?? optionalString(run, "sagittalModelKey") ?? optionalString(run, "axialModelKey");
  const measurementsByPlane = normalizeMeasurementsByPlane(rawRun.measurementsByPlane ?? run.measurementsByPlane);
  const artifactsByPlane = normalizeArtifactsByPlane(rawRun.artifactsByPlane ?? run.artifactsByPlane);
  return {
    runId: requireString(run, "runId", "/api/studies/{caseId}/runs"),
    databaseId: optionalString(run, "databaseId") ?? undefined,
    traceId: optionalString(run, "traceId") ?? undefined,
    caseId: typeof run.caseId === "string" ? run.caseId : study.caseId,
    planes,
    primaryPlane,
    plane: primaryPlane,
    requestedInferenceMode: optionalString(run, "requestedInferenceMode") ?? undefined,
    effectiveInferenceMode: optionalString(run, "effectiveInferenceMode") ?? undefined,
    status: typeof run.status === "string" ? run.status : "completed",
    reviewStatus: mapStatus(typeof run.reviewStatus === "string" ? run.reviewStatus : study.reviewStatus),
    reviewer: optionalString(run, "reviewer"),
    reviewedAt: optionalString(run, "reviewedAt"),
    comments: optionalString(run, "comments"),
    sagittalRunId: optionalString(run, "sagittalRunId"),
    axialRunId: optionalString(run, "axialRunId"),
    sagittalModelKey: optionalString(run, "sagittalModelKey"),
    axialModelKey: optionalString(run, "axialModelKey"),
    sagittalArtifactHash: optionalString(run, "sagittalArtifactHash"),
    axialArtifactHash: optionalString(run, "axialArtifactHash"),
    modelKey,
    modelStatus: typeof run.status === "string" ? run.status : study.modelStatus,
    measurementsByPlane,
    artifactsByPlane,
    corrections: Array.isArray(rawRun.corrections) ? rawRun.corrections : [],
    metricsSnapshot: asRecord(rawRun.metricsSnapshot),
    artifactCount: typeof run.artifactCount === "number" ? run.artifactCount : Object.values(artifactsByPlane).reduce((sum, values) => sum + (values?.length ?? 0), 0),
    measurementCount: typeof run.measurementCount === "number" ? run.measurementCount : Object.values(measurementsByPlane).reduce((sum, values) => sum + (values?.length ?? 0), 0),
    createdAt: typeof run.createdAt === "string" ? run.createdAt : undefined,
    updatedAt: typeof run.updatedAt === "string" ? run.updatedAt : undefined,
    humanReviewRequired: run.humanReviewRequired === undefined ? true : Boolean(run.humanReviewRequired),
    notClinicalDiagnosis: run.notClinicalDiagnosis === undefined ? true : Boolean(run.notClinicalDiagnosis),
    dataOrigin: mapDataOrigin(run.dataOrigin, mapDataOrigin(rawRun.dataOrigin, "database")),
  };
}

async function readJson(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: protectedHeaders() });
  if (!response.ok) throw new ApiError(`Backend respondio ${response.status}`, { status: response.status, path });
  return await response.json() as Record<string, unknown>;
}

export async function fetchStudyDetail(study: Pick<StudyRow, "caseId"> & Partial<StudyRow>): Promise<StudyDetailResponse> {
  const payload = await readJson(`/api/studies/${study.caseId}`);
  const normalizedStudy = normalizeStudy(payload.study ?? study, study);
  const runs = Array.isArray(payload.runs) ? payload.runs.map((run) => normalizeRun(run, normalizedStudy)) : [];
  const review = payload.review && typeof payload.review === "object" ? payload.review as ReviewStatusResponse : undefined;
  const measurements = runs[0]?.measurementsByPlane?.sagittal ?? [];
  return {
    status: "ok",
    study: normalizedStudy,
    runs,
    review,
    measurements,
    auditTrail: Array.isArray(payload.auditTrail) ? payload.auditTrail as any[] : [],
    humanReviewRequired: payload.humanReviewRequired === undefined ? true : Boolean(payload.humanReviewRequired),
    notClinicalDiagnosis: payload.notClinicalDiagnosis === undefined ? true : Boolean(payload.notClinicalDiagnosis),
    dataOrigin: mapDataOrigin(payload.dataOrigin, "database"),
  };
}

export async function fetchStudyRuns(study: Pick<StudyRow, "caseId"> & Partial<StudyRow>): Promise<StudyRun[]> {
  const payload = await readJson(`/api/studies/${study.caseId}/runs`);
  const normalizedStudy = normalizeStudy(study, study);
  return Array.isArray(payload.runs) ? payload.runs.map((run) => normalizeRun(run, normalizedStudy)) : [];
}
