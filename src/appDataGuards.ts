import { API_BASE_URL } from "./api";
import { normalizeAiAssetUrl } from "./inferenceReadiness";
import type { AssetName } from "./multiplanarRunTypes";
import type { AiRunResponse, Measurement, PersistedArtifact, PersistedStudyRun, Plane, PlaneRunId, ReviewableRun, SelectedStudyReference, StudiesSummary, StudyDetailResponse, StudyRow } from "./appTypes";

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

export type PersistedPlaneWorkspace = {
  planeRunId: PlaneRunId | null;
  plane: Plane;
  modelKey: string | null;
  artifactHash: string | null;
  measurements: Measurement[];
  artifacts: PersistedArtifact[];
  inputUrl?: string;
  overlayUrl?: string;
  maskPreviewUrl?: string;
  storageStatus: string;
  available: boolean;
};

const assetNames = ["input.png", "overlay.png", "mask-preview.png"] as const;
const unavailableStorageStatuses = new Set(["missing", "rejected", "unavailable"]);

function errorField(error: unknown, field: "code" | "path" | "traceId") {
  return error && typeof error === "object" && field in error && typeof (error as Record<string, unknown>)[field] === "string"
    ? (error as Record<string, string>)[field]
    : undefined;
}

function recordFrom(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" ? value as Record<string, any> : undefined;
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assetUrlFrom(value: unknown) {
  const record = recordFrom(value);
  return normalizeAiAssetUrl(typeof value === "string" ? value : record?.proxyUrl ?? record?.url, API_BASE_URL);
}

function artifactAvailable(artifact?: PersistedArtifact | null) {
  if (!artifact) return false;
  if (artifact.available === false) return false;
  if (artifact.storageStatus && unavailableStorageStatuses.has(artifact.storageStatus)) return false;
  return Boolean(artifact.proxyUrl);
}

function artifactUrl(artifact?: PersistedArtifact | null) {
  return artifactAvailable(artifact) ? normalizeAiAssetUrl(artifact?.proxyUrl, API_BASE_URL) : undefined;
}

function artifactsFromPlaneRun(planeRun: Record<string, any> | undefined, plane: Plane): PersistedArtifact[] {
  const assets = recordFrom(planeRun?.assets);
  if (!assets) return [];
  return assetNames.flatMap((assetName) => {
    const value = assets[assetName];
    const proxyUrl = assetUrlFrom(value);
    if (!proxyUrl) return [];
    const source = recordFrom(value);
    return [{
      plane,
      runId: stringFrom(source?.runId) ?? stringFrom(planeRun?.runId) ?? undefined,
      assetName,
      contentType: stringFrom(source?.contentType) ?? undefined,
      proxyUrl,
      storageStatus: stringFrom(source?.storageStatus) ?? "stored",
      storageKind: stringFrom(source?.storageKind) ?? undefined,
      sizeBytes: typeof source?.sizeBytes === "number" ? source.sizeBytes : typeof source?.size === "number" ? source.size : undefined,
      sha256: stringFrom(source?.sha256) ?? stringFrom(source?.checksum) ?? undefined,
      available: source?.available === false ? false : true,
    }];
  });
}

function artifactByName(artifacts: PersistedArtifact[], assetName: AssetName) {
  return artifacts.find((artifact) => artifact.assetName === assetName);
}

function mergeArtifactsByPriority(primary: PersistedArtifact[], secondary: PersistedArtifact[]) {
  const byName = new Map<string, PersistedArtifact>();
  for (const artifact of secondary) {
    if (artifact.assetName) byName.set(artifact.assetName, artifact);
  }
  for (const artifact of primary) {
    if (artifact.assetName) byName.set(artifact.assetName, artifact);
  }
  return Array.from(byName.values());
}

function measurementsFromPlaneRun(planeRun: Record<string, any> | undefined): Measurement[] {
  const measurements = planeRun?.measurements;
  if (Array.isArray(measurements)) return measurements as Measurement[];
  if (Array.isArray(measurements?.values)) return measurements.values as Measurement[];
  return [];
}

export function resolvePersistedPlaneWorkspace(run: AiRunResponse | null | undefined, plane: Plane): PersistedPlaneWorkspace {
  const planes = recordFrom(run?.planes);
  const planeRun = recordFrom(planes?.[plane]);
  const explicitPlaneRunId = plane === "sagittal" ? run?.sagittalRunId : run?.axialRunId;
  const planeRunId = stringFrom(planeRun?.runId) ?? stringFrom(explicitPlaneRunId);
  const planeRunArtifacts = artifactsFromPlaneRun(planeRun, plane);
  const persistedArtifacts = run?.artifactsByPlane?.[plane] ?? [];
  const artifacts = mergeArtifactsByPriority(planeRunArtifacts, persistedArtifacts);
  const inputArtifact = artifactByName(artifacts, "input.png");
  const overlayArtifact = artifactByName(artifacts, "overlay.png");
  const maskPreviewArtifact = artifactByName(artifacts, "mask-preview.png");
  const inputUrl = artifactUrl(inputArtifact);
  const overlayUrl = artifactUrl(overlayArtifact);
  const maskPreviewUrl = artifactUrl(maskPreviewArtifact);
  const measurements = run?.measurementsByPlane?.[plane] ?? measurementsFromPlaneRun(planeRun);
  const modelKey = stringFrom(planeRun?.modelKey) ?? stringFrom(plane === "sagittal" ? run?.sagittalModelKey : run?.axialModelKey) ?? stringFrom(run?.modelKey);
  const artifactHash = stringFrom(planeRun?.artifactHash) ?? stringFrom(planeRun?.aiOutput?.artifactHash) ?? stringFrom(plane === "sagittal" ? run?.sagittalArtifactHash : run?.axialArtifactHash);
  const storageStatus = inputArtifact?.storageStatus ?? overlayArtifact?.storageStatus ?? (planeRunId ? "missing" : "unavailable");
  return {
    planeRunId,
    plane,
    modelKey,
    artifactHash,
    measurements,
    artifacts,
    inputUrl,
    overlayUrl,
    maskPreviewUrl,
    storageStatus,
    available: Boolean(planeRunId && inputUrl),
  };
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
    if ((row.latestRunId ?? row.runId) !== safeRun.runId) return row;
    const plane = safeRun.plane ?? row.primaryPlane ?? row.plane ?? null;
    const modelKey = safeRun.modelKey ?? row.modelKey ?? null;
    return {
      ...row,
      caseId: safeRun.caseId ?? row.caseId,
      primaryPlane: plane,
      plane,
      modelKey,
      modelStatus: safeRun.measurementsStatus === "pending_real_inference" ? "Pipeline tecnico / inferencia pendiente" : safeRun.degradedMode ? "Modo degradado" : row.modelStatus,
      reviewStatus: safeRun.review?.status ?? row.reviewStatus,
      priority: safeRun.agentDecision?.priority ?? row.priority,
    };
  });
}

export function toSelectedStudyReference(study: StudyRow): SelectedStudyReference {
  return { caseId: study.caseId, subjectRef: study.subjectRef ?? study.patientId ?? null, studyDate: study.studyDate };
}

export function shouldFetchSubjectHistory(subjectRef: string | null | undefined) {
  return typeof subjectRef === "string" && subjectRef.trim().length > 0;
}

export function selectReviewableRunFromDetail(detail: StudyDetailResponse): ReviewableRun | null {
  const runs = detail.runs ?? [];
  if (!runs.length) return null;
  const latestRunId = detail.study.latestRunId ?? detail.study.runId ?? null;
  const firstRun = (latestRunId ? runs.find((run) => run.runId === latestRunId) : runs[0]) as PersistedStudyRun | undefined;
  if (!firstRun) return null;
  const primaryPlane = firstRun.primaryPlane ?? firstRun.plane ?? firstRun.planes?.[0] ?? detail.study.primaryPlane ?? detail.study.plane ?? undefined;
  const modelKey = firstRun.modelKey ?? firstRun.sagittalModelKey ?? firstRun.axialModelKey ?? detail.study.modelKey ?? undefined;
  const measurements = firstRun.measurementsByPlane?.sagittal ?? firstRun.measurementsByPlane?.axial ?? detail.measurements ?? [];
  const persistedPlanes = {
    sagittal: firstRun.sagittalRunId ? {
      runId: firstRun.sagittalRunId,
      plane: "sagittal" as const,
      modelKey: firstRun.sagittalModelKey ?? undefined,
      artifactHash: firstRun.sagittalArtifactHash ?? undefined,
      measurements: { values: firstRun.measurementsByPlane?.sagittal ?? [] },
      assets: Object.fromEntries((firstRun.artifactsByPlane?.sagittal ?? [])
        .filter((artifact) => artifact.assetName && artifact.proxyUrl)
        .map((artifact) => [artifact.assetName, artifact.proxyUrl])),
    } : undefined,
    axial: firstRun.axialRunId ? {
      runId: firstRun.axialRunId,
      plane: "axial" as const,
      modelKey: firstRun.axialModelKey ?? undefined,
      artifactHash: firstRun.axialArtifactHash ?? undefined,
      measurements: { values: firstRun.measurementsByPlane?.axial ?? [] },
      assets: Object.fromEntries((firstRun.artifactsByPlane?.axial ?? [])
        .filter((artifact) => artifact.assetName && artifact.proxyUrl)
        .map((artifact) => [artifact.assetName, artifact.proxyUrl])),
    } : null,
  };
  return {
    runId: firstRun.runId,
    caseId: detail.study.caseId,
    patientId: detail.study.subjectRef ?? detail.study.patientId ?? undefined,
    studyDate: detail.study.studyDate ?? undefined,
    plane: primaryPlane,
    primaryPlane: primaryPlane ?? null,
    modelKey,
    requestedInferenceMode: firstRun.requestedInferenceMode,
    effectiveInferenceMode: firstRun.effectiveInferenceMode,
    sagittalRunId: firstRun.sagittalRunId,
    axialRunId: firstRun.axialRunId,
    sagittalModelKey: firstRun.sagittalModelKey,
    axialModelKey: firstRun.axialModelKey,
    sagittalArtifactHash: firstRun.sagittalArtifactHash,
    axialArtifactHash: firstRun.axialArtifactHash,
    measurementsByPlane: firstRun.measurementsByPlane,
    artifactsByPlane: firstRun.artifactsByPlane,
    corrections: firstRun.corrections,
    planes: persistedPlanes,
    measurementValues: measurements,
    normalizedMeasurements: measurements,
    review: detail.review,
    reviewStatus: firstRun.reviewStatus,
    humanReviewRequired: detail.humanReviewRequired ?? true,
    notClinicalDiagnosis: detail.notClinicalDiagnosis ?? true,
    dataOrigin: firstRun.dataOrigin ?? detail.dataOrigin ?? "database",
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

export function isReviewQueueItem(study: StudyRow) {
  return study.reviewStatus === "pendiente" || study.reviewStatus === "observado";
}
