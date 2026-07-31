import { authHeaders, refreshDoctorSession } from "./authClient";
import { ensureAuthSession } from "./authStorage";
import { resolveMeasurementLabel } from "./clinicalDisplay";
import { appDataMode, isDemoDataMode, isRealDataMode, markDataOrigin } from "./dataMode";
import { frontendLogger } from "./security/frontendLogger";
import { toSafeFrontendError } from "./security/safeError";
import { generateTraceId } from "./security/traceId";
import type { AgentDecision, AiModel, AiRunResponse, CanonicalReviewStatus, DataOrigin, Measurement, PipelineRunRequest, Plane, Priority, RawMeasurements, ReviewExportRequest, ReviewExportResponse, ReviewMeasurementCorrection, ReviewStatus, ReviewStatusResponse, ReviewUpdateRequest, StudiesResponse, StudyRow, SystemDiagnostics } from "./appTypes";
import { priorityFromBackend } from "./studyMetadata";

declare global {
  interface Window {
    __PFI_CONFIG__?: {
      API_BASE_URL?: string;
    };
  }
}

const runtimeConfig = typeof window !== "undefined" ? window.__PFI_CONFIG__ : undefined;
export const API_BASE_URL = runtimeConfig?.API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// P10-C.1 §12: fail loudly (but not fatally) if the resolved backend origin
// looks unsafe. Never throws — a broken build must still be diagnosable.
function validateApiBaseUrlAtStartup(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      frontendLogger.error("[config] API_BASE_URL no debe incluir credenciales embebidas.");
    }
    const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (import.meta.env.PROD && parsed.protocol !== "https:" && !isLocalHost) {
      frontendLogger.error("[config] En produccion, API_BASE_URL debe ser HTTPS.");
    }
    if (parsed.search) {
      frontendLogger.error("[config] API_BASE_URL no debe incluir query string.");
    }
  } catch {
    frontendLogger.error("[config] API_BASE_URL no es una URL valida.");
  }
}
try {
  validateApiBaseUrlAtStartup(API_BASE_URL);
} catch {
  // Startup diagnostics must never break module evaluation.
}

export class ApiError extends Error {
  status?: number;
  code?: string;
  traceId?: string;
  path: string;
  body?: unknown;

  constructor(message: string, options: { status?: number; code?: string; traceId?: string; path: string; body?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.traceId = options.traceId;
    this.path = options.path;
    this.body = options.body;
  }
}

export class ContractError extends Error {
  path?: string;
  code?: string;
  traceId?: string;
  body?: unknown;

  constructor(message: string, path?: string, options?: { code?: string; traceId?: string; body?: unknown }) {
    super(message);
    this.name = "ContractError";
    this.path = path;
    this.code = options?.code;
    this.traceId = options?.traceId;
    this.body = options?.body;
  }
}

export const isDemoMode = () => isDemoDataMode;

function frontendTraceId() {
  return generateTraceId("frontend");
}

function mapPriority(value?: string): Priority {
  if (value === "high" || value === "alta") return "alta";
  if (value === "low" || value === "baja") return "baja";
  return "media";
}

function mapReviewStatus(value?: string): ReviewStatus {
  if (value === "accepted" || value === "aceptado") return "aceptado";
  if (value === "observed" || value === "edited" || value === "observado") return "observado";
  if (value === "rejected" || value === "descartado") return "descartado";
  return "pendiente";
}

function toCanonicalReviewStatus(status: ReviewStatus): CanonicalReviewStatus {
  if (status === "aceptado") return "accepted";
  if (status === "observado") return "observed";
  if (status === "descartado") return "rejected";
  return "pending";
}

function normalizePlane(value: unknown): Plane | undefined {
  return value === "axial" || value === "sagittal" ? value : undefined;
}

function normalizeDataOrigin(value: unknown, fallback: DataOrigin): DataOrigin {
  return value === "backend" || value === "ai_module" || value === "database" || value === "demo" ? value : fallback;
}

function optionalStringOrNull(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : null;
}

function normalizePlanes(value: unknown, context: string): Plane[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    const record = asRecord(value);
    if (record) return Object.keys(record).map(normalizePlane).filter((plane): plane is Plane => Boolean(plane));
    throw new ContractError(`Contrato incompleto en ${context}: planes debe ser una lista.`, context);
  }
  return value.map(normalizePlane).filter((plane): plane is Plane => Boolean(plane));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

async function demoStudiesResponse(): Promise<StudiesResponse> {
  const { worklistStudies } = await import("./data/mockStudies");
  return markDataOrigin({ status: "demo", source: "demo", items: worklistStudies, humanReviewRequired: true, notClinicalDiagnosis: true }, "demo");
}

async function demoModelsResponse(): Promise<AiModel[]> {
  const { sampleModels } = await import("./mock/sampleRun");
  return sampleModels.map((model) => markDataOrigin({ ...model }, "demo"));
}

async function demoRunResponse(run?: Partial<AiRunResponse>): Promise<AiRunResponse> {
  const { sampleRun } = await import("./mock/sampleRun");
  return normalizeDemoRun({ ...sampleRun, ...run });
}

function normalizeModels(response: unknown): AiModel[] {
  if (Array.isArray(response)) return response as AiModel[];
  const record = asRecord(response);
  if (!record) throw new ContractError("Formato invalido de modelos: se esperaba lista u objeto con models.", "/api/ai/models");
  const modelsValue = record.models;
  if (modelsValue === undefined || modelsValue === null) return [];
  if (Array.isArray(modelsValue)) return modelsValue as AiModel[];
  if (modelsValue && typeof modelsValue === "object") {
    return Object.entries(modelsValue as Record<string, unknown>).map(([key, value]) => {
      const model = asRecord(value) ?? {};
      const plane = normalizePlane(model.plane);
      return {
        key,
        name: typeof model.name === "string" ? model.name : key,
        version: typeof model.version === "string" ? model.version : undefined,
        planes: plane ? [plane] : undefined,
        enabled: model.enabled === undefined ? true : Boolean(model.enabled),
      };
    });
  }
  throw new ContractError("Formato invalido de modelos.", "/api/ai/models");
}

function normalizeReview(runId: string, review?: ReviewStatusResponse & { reviewStatus?: string; comments?: string; multiplanarRunId?: string }): ReviewStatusResponse {
  const status = mapReviewStatus(review?.reviewStatus ?? review?.status);
  const normalizedRunId = review?.runId ?? review?.multiplanarRunId ?? runId;
  return {
    runId: normalizedRunId,
    status,
    notes: review?.notes ?? review?.observations ?? review?.comments ?? "",
    observations: review?.observations ?? review?.notes ?? review?.comments ?? "",
    reviewer: review?.reviewer ?? "",
    updatedAt: review?.updatedAt ?? review?.reviewedAt,
    reviewedAt: review?.reviewedAt ?? review?.updatedAt,
  };
}

function toMeasurement(value: unknown, index: number): Measurement {
  const record = asRecord(value) ?? {};
  const baseValue = typeof record.value === "number" || typeof record.value === "string"
    ? record.value
    : typeof record.aiValue === "number" || typeof record.aiValue === "string"
      ? record.aiValue
      : "";
  const reviewerValue = typeof record.reviewerValue === "number" || typeof record.reviewerValue === "string" || record.reviewerValue === null ? record.reviewerValue : undefined;
  const linkedLandmarks = Array.isArray(record.linkedLandmarks) ? record.linkedLandmarks.filter((item): item is string => typeof item === "string") : undefined;
  const label = resolveMeasurementLabel(record);
  return {
    id: typeof record.id === "string" ? record.id : `measurement-${index}`,
    label,
    level: typeof record.level === "string" ? record.level : undefined,
    sliceIndex: typeof record.sliceIndex === "number" ? record.sliceIndex : undefined,
    value: baseValue,
    aiValue: typeof record.aiValue === "number" || typeof record.aiValue === "string" ? record.aiValue : baseValue,
    reviewerValue,
    unit: typeof record.unit === "string" ? record.unit : "",
    confidence: typeof record.confidence === "number" ? record.confidence : undefined,
    plane: normalizePlane(record.plane),
    source: record.source === "Reviewer" || record.source === "AI" || record.source === "Placeholder" ? record.source : "AI",
    status: record.status === "revisado" || record.status === "editado" || record.status === "pendiente" ? record.status : "pendiente",
    outlier: Boolean(record.outlier),
    placeholder: Boolean(record.placeholder),
    linkedLandmarks,
  };
}

function normalizeMeasurements(value: unknown): { normalizedMeasurements: Measurement[]; measurementsStatus?: string; measurementsDescription?: string } {
  if (value === undefined || value === null) return { normalizedMeasurements: [] };
  if (Array.isArray(value)) return { normalizedMeasurements: value.map(toMeasurement) };
  const record = asRecord(value) as RawMeasurements | undefined;
  if (!record) throw new ContractError("Formato invalido de mediciones.");
  if (Array.isArray(record.values)) {
    return { normalizedMeasurements: record.values.map(toMeasurement), measurementsStatus: record.status, measurementsDescription: record.description };
  }
  if (record.status === "pending_real_inference") {
    return { normalizedMeasurements: [], measurementsStatus: record.status, measurementsDescription: record.description };
  }
  if (typeof record.status === "string" || typeof record.description === "string") {
    return { normalizedMeasurements: [], measurementsStatus: record.status, measurementsDescription: record.description };
  }
  throw new ContractError("Formato invalido de mediciones.");
}

function normalizeAgentDecision(agentDecision?: AgentDecision): AgentDecision {
  const priority = mapPriority(agentDecision?.priority ?? agentDecision?.reviewPriority);
  const flags = agentDecision?.flags ?? agentDecision?.agentReasons ?? [];
  const reasons = agentDecision?.reasons ?? agentDecision?.agentReasons ?? flags;
  return {
    ...agentDecision,
    status: agentDecision?.status ?? agentDecision?.agentStatus ?? "requiere_revision",
    priority,
    flags,
    reasons,
    humanReviewRequired: agentDecision?.humanReviewRequired ?? true,
    notClinicalDiagnosis: agentDecision?.notClinicalDiagnosis ?? true,
  };
}

function requireString(record: Record<string, unknown>, key: string, context: string) {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new ContractError(`Contrato incompleto en ${context}: falta ${key}.`, context);
  return value;
}

export function normalizeStudyRow(value: unknown, index: number): StudyRow {
  const record = asRecord(value);
  if (!record) throw new ContractError(`Estudio invalido en posicion ${index}.`, "/api/studies");
  const planes = normalizePlanes(record.planes, "/api/studies");
  const aliasPlane = normalizePlane(record.plane);
  const primaryPlane = normalizePlane(record.primaryPlane) ?? aliasPlane ?? null;
  const subjectRef = optionalStringOrNull(record, "subjectRef") ?? optionalStringOrNull(record, "patientId");
  const latestRunId = optionalStringOrNull(record, "latestRunId") ?? optionalStringOrNull(record, "runId");
  const reviewPriority = typeof record.reviewPriority === "string" ? priorityFromBackend(record.reviewPriority as "low" | "medium" | "high") : undefined;
  const dataOrigin = normalizeDataOrigin(record.dataOrigin, "backend");
  return {
    caseId: requireString(record, "caseId", "/api/studies"),
    subjectRef,
    patientId: subjectRef,
    studyDate: optionalStringOrNull(record, "studyDate"),
    modality: optionalStringOrNull(record, "modality"),
    description: optionalStringOrNull(record, "description"),
    status: typeof record.status === "string" ? record.status : "created",
    planes,
    primaryPlane,
    plane: primaryPlane,
    latestRunId,
    runId: latestRunId,
    modelKey: optionalStringOrNull(record, "modelKey"),
    modelStatus: typeof record.modelStatus === "string" ? record.modelStatus : "sin_estado",
    reviewStatus: mapReviewStatus(typeof record.reviewStatus === "string" ? record.reviewStatus : undefined),
    priority: mapPriority(typeof record.priority === "string" ? record.priority : reviewPriority),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    dataOrigin,
  };
}

export function normalizeStudiesResponse(response: unknown): StudiesResponse {
  const record = asRecord(response);
  if (!record) throw new ContractError("Formato invalido de estudios.", "/api/studies");
  const itemsValue = record.items;
  if (!Array.isArray(itemsValue)) throw new ContractError("Formato invalido de estudios: falta items[].", "/api/studies");
  const dataOrigin = normalizeDataOrigin(record.dataOrigin, record.status === "demo" || record.source === "demo" ? "demo" : "backend");
  const items = itemsValue.map(normalizeStudyRow).map((item) => ({ ...item, dataOrigin: item.dataOrigin ?? dataOrigin }));
  const pending = items.filter((item) => item.reviewStatus === "pendiente" || item.reviewStatus === "observado").length;
  const completed = items.filter((item) => item.reviewStatus === "aceptado").length;
  const flagged = items.filter((item) => item.priority === "alta" || item.reviewStatus === "observado").length;
  return {
    status: typeof record.status === "string" ? record.status : "ok",
    source: typeof record.source === "string" ? record.source : "backend",
    items,
    summary: { total: items.length, pending, completed, flagged },
    humanReviewRequired: record.humanReviewRequired === undefined ? true : Boolean(record.humanReviewRequired),
    notClinicalDiagnosis: record.notClinicalDiagnosis === undefined ? true : Boolean(record.notClinicalDiagnosis),
    dataOrigin,
  } as StudiesResponse;
}

function validateReviewPayload(payload: ReviewUpdateRequest) {
  const status = payload.status;
  const notes = String(payload.notes ?? payload.observations ?? "").trim();
  if ((status === "observado" || status === "descartado") && notes.length < 5) throw new Error("Para observar o descartar un caso, agrega una nota profesional descriptiva.");
}

function valuesDiffer(beforeValue: unknown, afterValue: unknown) {
  return String(beforeValue ?? "").trim() !== String(afterValue ?? "").trim();
}

export function buildReviewCorrections(measurements: Measurement[] = [], comment?: string): ReviewMeasurementCorrection[] {
  return measurements.flatMap((measurement) => {
    const aiValue = measurement.aiValue ?? measurement.value;
    const reviewerValue = measurement.reviewerValue;
    if (reviewerValue === undefined || reviewerValue === null || reviewerValue === "") return [];
    if (!measurement.forceCorrection && !valuesDiffer(aiValue, reviewerValue)) return [];
    return [{
      measurementId: measurement.id,
      label: measurement.label,
      beforeValue: {
        value: aiValue ?? null,
        unit: measurement.unit,
        confidence: measurement.confidence,
        plane: measurement.plane,
      },
      afterValue: {
        value: reviewerValue,
        unit: measurement.unit,
        plane: measurement.plane,
      },
      ...(comment ? { comment } : {}),
    }];
  });
}

export function normalizeRealRun(run?: AiRunResponse): AiRunResponse {
  const record = asRecord(run);
  if (!record) throw new ContractError("Contrato de corrida invalido: respuesta vacia.", "/api/ai/pipeline/run");
  const planes = normalizePlanes(record.planes, "/api/ai/pipeline/run");
  const plane = normalizePlane(record.plane) ?? normalizePlane(record.primaryPlane) ?? planes[0];
  if (!plane) throw new ContractError("Contrato de corrida invalido: plano faltante o invalido.", "/api/ai/pipeline/run");
  const runId = requireString(record, "runId", "/api/ai/pipeline/run");
  const measurementState = normalizeMeasurements(record.measurements ?? record.measurementValues ?? record.normalizedMeasurements);
  const metadata = asRecord(record.metadata) ?? undefined;
  const modelKey = typeof record.modelKey === "string" && record.modelKey.trim()
    ? record.modelKey
    : typeof record.sagittalModelKey === "string" && record.sagittalModelKey.trim()
      ? record.sagittalModelKey
      : typeof record.axialModelKey === "string" && record.axialModelKey.trim()
        ? record.axialModelKey
        : undefined;
  if (!modelKey) throw new ContractError("Contrato de corrida invalido: falta modelKey.", "/api/ai/pipeline/run");
  return {
    ...run,
    runId,
    caseId: requireString(record, "caseId", "/api/ai/pipeline/run"),
    plane,
    planes: planes.length ? planes : [plane],
    primaryPlane: plane,
    modelKey,
    inputId: typeof record.inputId === "string" ? record.inputId : undefined,
    inputPath: typeof record.inputPath === "string" && !record.inputPath.startsWith("demo/") ? record.inputPath : undefined,
    metadata,
    agentDecision: normalizeAgentDecision(run?.agentDecision ?? run?.aiOutput?.agentDecision),
    measurementValues: measurementState.normalizedMeasurements,
    normalizedMeasurements: measurementState.normalizedMeasurements,
    measurementsStatus: measurementState.measurementsStatus,
    measurementsDescription: measurementState.measurementsDescription,
    overlayPath: run?.overlayPath ?? null,
    review: normalizeReview(runId, run?.review),
    aiModuleAvailable: run?.aiModuleAvailable ?? true,
    degradedMode: run?.degradedMode ?? false,
    humanReviewRequired: run?.humanReviewRequired ?? run?.agentDecision?.humanReviewRequired ?? run?.aiOutput?.humanReviewRequired ?? true,
    notClinicalDiagnosis: run?.notClinicalDiagnosis ?? run?.agentDecision?.notClinicalDiagnosis ?? run?.aiOutput?.notClinicalDiagnosis ?? true,
    dataOrigin: normalizeDataOrigin(record.dataOrigin, "backend"),
  } as AiRunResponse;
}

export function normalizeRun(run?: AiRunResponse): AiRunResponse {
  return normalizeRealRun(run);
}

export function normalizeDemoRun(run?: AiRunResponse): AiRunResponse {
  const record = asRecord(run) ?? {};
  const runId = typeof record.runId === "string" ? record.runId : `demo-run-${Date.now()}`;
  const plane = normalizePlane(record.plane) ?? "sagittal";
  const measurementState = normalizeMeasurements(record.measurements ?? record.measurementValues ?? record.normalizedMeasurements);
  return {
    ...run,
    runId,
    caseId: typeof record.caseId === "string" ? record.caseId : "CASE-DEMO-0142",
    plane,
    modelKey: typeof record.modelKey === "string" ? record.modelKey : "sagittal_spider",
    metadata: asRecord(record.metadata) ?? { source: "demo", uiVersion: "redesign-v1" },
    agentDecision: normalizeAgentDecision(run?.agentDecision ?? run?.aiOutput?.agentDecision),
    measurementValues: measurementState.normalizedMeasurements,
    normalizedMeasurements: measurementState.normalizedMeasurements,
    measurementsStatus: measurementState.measurementsStatus,
    measurementsDescription: measurementState.measurementsDescription,
    review: normalizeReview(runId, run?.review),
    aiModuleAvailable: true,
    degradedMode: false,
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    dataOrigin: "demo",
  } as AiRunResponse;
}

async function readErrorBody(response: Response) {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try { return await response.json(); } catch { return undefined; }
  }
  try { return await response.text(); } catch { return undefined; }
}

function buildApiError(path: string, traceId: string, response?: Response, body?: unknown, cause?: unknown) {
  void cause; // network-failure causes are never rendered directly (P10-C.1 §6) — the safe fallback below covers them.
  const bodyRecord = asRecord(body);
  const code = typeof bodyRecord?.code === "string" ? bodyRecord.code : undefined;
  const candidateMessage = typeof bodyRecord?.message === "string" ? bodyRecord.message : undefined;
  const safe = toSafeFrontendError(response?.status, { code, traceId, candidateMessage });
  return new ApiError(safe.message, { status: response?.status, code, traceId, path, body });
}

async function request<T>(path: string, init?: RequestInit, fallback?: () => T | Promise<T>, includeAuth = true): Promise<T> {
  if (isDemoDataMode) {
    if (!fallback) throw new ApiError(`Endpoint ${path} no tiene fixture demo explicito.`, { path });
    return await fallback();
  }

  const traceId = frontendTraceId();
  const requestInit = () => ({
    ...init,
    headers: { "Content-Type": "application/json", "X-Trace-Id": traceId, ...(includeAuth ? authHeaders() : {}), ...init?.headers },
  });
  const url = `${API_BASE_URL}${path}`;

  // La sesión vive en IndexedDB: si el request sale antes de que termine de
  // hidratarse viaja sin Authorization y el 401 resultante invalida la sesión.
  if (includeAuth) await ensureAuthSession();

  try {
    let response = await fetch(url, requestInit());
    if (response.status === 401 && includeAuth) {
      await refreshDoctorSession();
      response = await fetch(url, requestInit());
    }
    if (!response.ok) {
      const body = await readErrorBody(response);
      throw buildApiError(path, traceId, response, body);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw buildApiError(path, traceId, undefined, undefined, error);
  }
}

// /api/ai/health and /api/ai/models are protected endpoints (any authenticated,
// non-pending professional) per the Backend's AuthFilter default gate — they
// are NOT public. Authorization must always be attached here.
export async function getHealth() {
  return request<{ status: string; service?: string }>("/api/ai/health", undefined, () => markDataOrigin({ status: "demo", service: "mock-local" }, "demo"));
}

export async function getModels(): Promise<AiModel[]> {
  const response = await request<unknown>("/api/ai/models", undefined, demoModelsResponse);
  return normalizeModels(response);
}

/**
 * The only endpoint that is genuinely public (no Authorization) for a
 * pre-login liveness check, per the Backend's AuthFilter.PUBLIC_LIVENESS_PATHS.
 * Never use /api/ai/health for this — that endpoint requires an authenticated,
 * non-pending session and will 401 without one.
 */
export async function getPublicSystemHealth(): Promise<{ status: string }> {
  return request<{ status: string }>("/api/system/health", undefined, () => markDataOrigin({ status: "demo" }, "demo"), false);
}

export async function getStudies(): Promise<StudiesResponse> {
  const response = await request<unknown>("/api/studies", undefined, demoStudiesResponse);
  return normalizeStudiesResponse(response);
}

// ADMIN-only per SystemController (RoleAuthorizationService.requireAdmin) —
// still requires Authorization; the Backend enforces the role, not the client.
export async function getSystemDiagnostics(): Promise<SystemDiagnostics> {
  return request<SystemDiagnostics>("/api/system/diagnostics", undefined, () => markDataOrigin({ status: "demo", checkedAt: new Date().toISOString(), backend: { available: true, status: "demo" }, aiModule: { available: true, status: "demo" }, database: { available: true, status: "demo", mode: "mock" }, auth: { enabled: true, status: "demo" }, persistence: { mode: "mock", postgresEnabled: false }, humanReviewRequired: true, notClinicalDiagnosis: true }, "demo"));
}

// Any authenticated, non-pending professional (AuthFilter default gate) — not public.
export async function getAiCompletion(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/ai/completion", undefined, () => markDataOrigin({ status: "demo", completionPercent: 67, humanReviewRequired: true, notClinicalDiagnosis: true }, "demo"));
}

export async function getAiRoadmap(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/ai/roadmap", undefined, () => markDataOrigin({ status: "demo", currentMode: "contract", completed: [], pending: [] }, "demo"));
}

export async function getAiEvaluationContract(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/ai/evaluation/contract", undefined, () => markDataOrigin({ status: "demo", metrics: [] }, "demo"));
}

export async function getAiEvaluationSummary(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/ai/evaluation/summary", undefined, () => markDataOrigin({ status: "demo", reportCount: 0 }, "demo"));
}

// ADMIN-only per SystemController (RoleAuthorizationService.requireAdmin).
export async function warmupSystem(): Promise<SystemDiagnostics> {
  return request<SystemDiagnostics>("/api/system/warmup", { method: "POST" }, () => markDataOrigin({ status: "demo", checkedAt: new Date().toISOString(), aiModule: { available: true, status: "demo", message: "warmup demo" } }, "demo"));
}

export async function getDemoStudyReview(): Promise<any> {
  if (isRealDataMode) throw new ApiError("getDemoStudyReview esta deshabilitado con VITE_USE_MOCK=false.", { path: "/api/studies/demo-review" });
  return request<any>("/api/studies/demo-review", undefined, () => null);
}

export async function runPipeline(payload: PipelineRunRequest): Promise<AiRunResponse> {
  const requestedMetadata = payload.metadata ?? { source: "frontend-review-workspace", uiVersion: "redesign-v1" };
  const requestsRealBaseline = requestedMetadata.inferenceMode === "real_baseline";
  const metadata = requestsRealBaseline
    ? { ...requestedMetadata, inferenceMode: "real_baseline", allowContractFallback: false }
    : requestedMetadata;
  const inputPathIsDemo = typeof payload.inputPath === "string" && payload.inputPath.startsWith("demo/");
  const requestPayload: PipelineRunRequest = {
    caseId: payload.caseId,
    plane: requestsRealBaseline ? "sagittal" : payload.plane,
    modelKey: requestsRealBaseline ? "sagittal_spider" : payload.modelKey,
    metadata,
    ...(payload.inputId ? { inputId: payload.inputId } : {}),
    ...(!requestsRealBaseline && !payload.inputId && isDemoDataMode ? { inputPath: payload.inputPath ?? "demo/CASE-DEMO-0142" } : {}),
    ...(requestsRealBaseline && payload.inputPath && !inputPathIsDemo && !payload.inputId ? { inputPath: payload.inputPath } : {}),
  };
  if (requestsRealBaseline && !requestPayload.inputId && !requestPayload.inputPath) {
    throw new Error("Inferencia real_baseline requiere inputId opaco devuelto por POST /api/ai/inputs.");
  }
  const response = await request<AiRunResponse>(
    "/api/ai/pipeline/run",
    { method: "POST", body: JSON.stringify(requestPayload) },
    isDemoDataMode ? () => demoRunResponse({ ...requestPayload, runId: `demo-run-${Date.now()}`, createdAt: new Date().toISOString() }) : undefined,
  );
  const normalized = isDemoDataMode ? normalizeDemoRun(response) : normalizeRealRun(response);
  try {
    const report = await getAgentReport(normalized.runId ?? "");
    return isDemoDataMode ? normalizeDemoRun({ ...normalized, ...report, agentDecision: report.agentDecision ?? normalized.agentDecision }) : normalizeRealRun({ ...normalized, ...report, agentDecision: report.agentDecision ?? normalized.agentDecision });
  } catch {
    return normalized;
  }
}

export async function getAgentReport(runId: string): Promise<AiRunResponse> {
  const response = await request<AiRunResponse>(`/api/ai/agent/report/${runId}`, undefined, isDemoDataMode ? () => demoRunResponse({ runId }) : undefined);
  return isDemoDataMode ? normalizeDemoRun(response) : normalizeRealRun(response);
}

export async function updateReview(runId: string, payload: ReviewUpdateRequest): Promise<ReviewStatusResponse> {
  validateReviewPayload(payload);
  const comments = payload.notes ?? payload.observations ?? "";
  const corrections = payload.corrections ?? buildReviewCorrections(payload.measurements ?? [], comments);
  const body = {
    reviewStatus: toCanonicalReviewStatus(payload.status),
    reviewer: payload.reviewer ?? "Revisor",
    comments,
    corrections,
  };
  return request<ReviewStatusResponse>(
    `/api/ai/runs/${encodeURIComponent(runId)}/review`,
    { method: "PUT", body: JSON.stringify(body) },
    isDemoDataMode ? () => normalizeReview(runId, { reviewStatus: body.reviewStatus, reviewer: body.reviewer, comments: body.comments, runId, updatedAt: new Date().toISOString() }) : undefined,
  ).then((review) => normalizeReview(runId, review));
}

/**
 * Anotaciones del revisor de una corrida.
 *
 * El PUT reemplaza el conjunto completo, que es como la sala de lectura las edita:
 * se agregan y se borran en pantalla y se guardan como una unidad. Un endpoint de
 * solo-agregar dejaría el borrado sin forma de expresarse.
 */
export async function getRunAnnotations(runId: string): Promise<unknown[]> {
  const response = await request<unknown>(`/api/ai/runs/${encodeURIComponent(runId)}/annotations`);
  return Array.isArray(response) ? response : [];
}

export async function saveRunAnnotations(runId: string, annotations: unknown[]): Promise<unknown[]> {
  const response = await request<unknown>(
    `/api/ai/runs/${encodeURIComponent(runId)}/annotations`,
    { method: "PUT", body: JSON.stringify(annotations) },
  );
  return Array.isArray(response) ? response : [];
}

export async function exportReviewReport(runId: string, payload: ReviewExportRequest): Promise<ReviewExportResponse> {
  return request<ReviewExportResponse>(`/api/ai/review/${runId}/export`, { method: "POST", body: JSON.stringify(payload) });
}
