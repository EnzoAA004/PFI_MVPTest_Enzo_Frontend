import { mockMeasurements } from "./data/mockMeasurements";
import { sampleModels, sampleRun } from "./mock/sampleRun";
import type {
  AgentDecision,
  AiModel,
  AiRunResponse,
  Measurement,
  PipelineRunRequest,
  Priority,
  RawMeasurements,
  ReviewStatusResponse,
  ReviewUpdateRequest,
} from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const FALLBACK_RUN_ID = "demo-run-2026-001";

let demoMode = USE_MOCK;
let mockRun: AiRunResponse = sampleRun;

export const isDemoMode = () => demoMode;

function mapPriority(value?: string): Priority {
  if (value === "high" || value === "alta") return "alta";
  if (value === "low" || value === "baja") return "baja";
  return "media";
}

function normalizeModels(response: unknown): AiModel[] {
  if (Array.isArray(response)) return response as AiModel[];

  if (response && typeof response === "object" && "models" in response) {
    const modelsValue = (response as { models?: unknown }).models;
    if (Array.isArray(modelsValue)) return modelsValue as AiModel[];

    if (modelsValue && typeof modelsValue === "object") {
      return Object.entries(modelsValue).map(([key, value]) => {
        const model = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
        const plane = model.plane === "axial" || model.plane === "sagittal" ? model.plane : undefined;
        return {
          key,
          name: typeof model.name === "string" ? model.name : key,
          version: typeof model.version === "string" ? model.version : "backend",
          planes: plane ? [plane] : undefined,
          enabled: true,
        };
      });
    }
  }

  return sampleModels;
}

function normalizeReview(runId: string, review?: ReviewStatusResponse): ReviewStatusResponse {
  return {
    runId: review?.runId ?? runId,
    status: review?.status ?? "pendiente",
    notes: review?.notes ?? review?.observations ?? "",
    observations: review?.observations ?? review?.notes ?? "",
    reviewer: review?.reviewer ?? "",
    updatedAt: review?.updatedAt ?? review?.reviewedAt,
    reviewedAt: review?.reviewedAt ?? review?.updatedAt,
  };
}

function normalizeAgentDecision(agent?: AgentDecision): AgentDecision {
  const reasons = agent?.reasons ?? agent?.agentReasons ?? [];
  return {
    ...agent,
    status: agent?.status ?? agent?.agentStatus ?? "requiere_revision",
    priority: agent?.priority ?? mapPriority(agent?.reviewPriority),
    flags: agent?.flags ?? agent?.agentReasons ?? [],
    reasons,
    humanReviewRequired: agent?.humanReviewRequired ?? true,
    notClinicalDiagnosis: agent?.notClinicalDiagnosis ?? true,
    recommendedAction:
      agent?.recommendedAction ?? "Revisar overlays, mediciones y trazabilidad antes de usar el resultado.",
  };
}

function measurementFromUnknown(item: unknown, index: number): Measurement {
  const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const rawValue = row.value ?? row.measurementValue ?? row.result ?? "";
  const numericValue = typeof rawValue === "number" || typeof rawValue === "string" ? rawValue : String(rawValue);
  const confidence = typeof row.confidence === "number" ? row.confidence : undefined;
  return {
    id: String(row.id ?? row.key ?? `measurement-${index + 1}`),
    label: String(row.label ?? row.name ?? row.measurement ?? "Technical measurement"),
    value: numericValue,
    unit: String(row.unit ?? ""),
    confidence,
    plane: row.plane === "axial" || row.plane === "sagittal" ? row.plane : undefined,
    source: row.source === "Reviewer" ? "Reviewer" : "AI",
    status: row.status === "editado" || row.status === "revisado" ? row.status : "pendiente",
    outlier: Boolean(row.outlier),
  };
}

function normalizeMeasurements(input?: AiRunResponse["measurements"]) {
  if (Array.isArray(input)) {
    return {
      normalizedMeasurements: input.map((item, index) => measurementFromUnknown(item, index)),
      measurementsStatus: "available",
      measurementsDescription: "",
    };
  }

  const raw = input as RawMeasurements | undefined;
  if (raw?.values && Array.isArray(raw.values) && raw.values.length > 0) {
    return {
      normalizedMeasurements: raw.values.map((item, index) => measurementFromUnknown(item, index)),
      measurementsStatus: raw.status ?? "available",
      measurementsDescription: raw.description ?? "",
    };
  }

  if (raw?.status === "pending_real_inference") {
    return {
      normalizedMeasurements: mockMeasurements.map((measurement) => ({
        ...measurement,
        source: "Placeholder" as const,
        status: "pendiente" as const,
        placeholder: true,
      })),
      measurementsStatus: "pending_real_inference",
      measurementsDescription:
        raw.description ?? "Pipeline tecnico disponible; inferencia real de mediciones pendiente.",
    };
  }

  return {
    normalizedMeasurements: mockMeasurements,
    measurementsStatus: raw?.status ?? "placeholder",
    measurementsDescription: raw?.description ?? "Mediciones mock de-identificadas para revision de interfaz.",
  };
}

export function normalizeRun(run?: AiRunResponse): AiRunResponse {
  const runId = run?.runId ?? sampleRun.runId ?? FALLBACK_RUN_ID;
  const measurementState = normalizeMeasurements(run?.measurements ?? sampleRun.measurements);

  return {
    ...sampleRun,
    ...run,
    runId,
    caseId: run?.caseId ?? sampleRun.caseId ?? "CASE-DEMO-0142",
    plane: run?.plane ?? sampleRun.plane ?? "sagittal",
    modelKey: run?.modelKey ?? sampleRun.modelKey ?? "sagittal_spider",
    inputPath: run?.inputPath ?? "demo/CASE-DEMO-0142",
    metadata: run?.metadata ?? { source: "frontend-review-workspace", uiVersion: "redesign-v1" },
    agentDecision: normalizeAgentDecision(run?.agentDecision ?? sampleRun.agentDecision),
    measurements: run?.measurements ?? sampleRun.measurements,
    normalizedMeasurements: measurementState.normalizedMeasurements,
    measurementsStatus: measurementState.measurementsStatus,
    measurementsDescription: measurementState.measurementsDescription,
    overlayPath: run?.overlayPath ?? null,
    review: normalizeReview(runId, run?.review),
    aiModuleAvailable: run?.aiModuleAvailable ?? true,
    degradedMode: run?.degradedMode ?? false,
    humanReviewRequired: run?.humanReviewRequired ?? run?.agentDecision?.humanReviewRequired ?? true,
    notClinicalDiagnosis: run?.notClinicalDiagnosis ?? run?.agentDecision?.notClinicalDiagnosis ?? true,
  };
}

async function request<T>(path: string, init?: RequestInit, fallback?: () => T): Promise<T> {
  if (USE_MOCK && fallback) {
    demoMode = true;
    return fallback();
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
      ...init,
    });

    if (!response.ok) throw new Error(`Backend respondio ${response.status}`);

    demoMode = false;
    return (await response.json()) as T;
  } catch (error) {
    if (fallback) {
      demoMode = true;
      return fallback();
    }
    throw error;
  }
}

export async function getHealth() {
  return request<{ status: string; service?: string }>("/api/ai/health", undefined, () => ({
    status: "demo",
    service: "mock-local",
  }));
}

export async function getModels(): Promise<AiModel[]> {
  const response = await request<unknown>("/api/ai/models", undefined, () => sampleModels);
  return normalizeModels(response);
}

export async function runPipeline(payload: PipelineRunRequest): Promise<AiRunResponse> {
  const requestPayload: PipelineRunRequest = {
    caseId: payload.caseId,
    plane: payload.plane,
    modelKey: payload.modelKey,
    inputPath: payload.inputPath ?? "demo/CASE-DEMO-0142",
    metadata: payload.metadata ?? {
      source: "frontend-review-workspace",
      uiVersion: "redesign-v1",
    },
  };

  const response = await request<AiRunResponse>(
    "/api/ai/pipeline/run",
    {
      method: "POST",
      body: JSON.stringify(requestPayload),
    },
    () => {
      mockRun = normalizeRun({
        ...sampleRun,
        ...requestPayload,
        runId: `demo-run-${Date.now()}`,
        createdAt: new Date().toISOString(),
      });
      return mockRun;
    },
  );

  const normalized = normalizeRun(response);
  try {
    const report = await getAgentReport(normalized.runId ?? FALLBACK_RUN_ID);
    return normalizeRun({ ...normalized, ...report, agentDecision: report.agentDecision ?? normalized.agentDecision });
  } catch {
    return normalized;
  }
}

export async function getAgentReport(runId: string): Promise<AiRunResponse> {
  const response = await request<AiRunResponse>(
    `/api/ai/agent/report/${runId}`,
    undefined,
    () => normalizeRun({ ...mockRun, runId }),
  );
  return normalizeRun(response);
}

export async function updateReview(runId: string, payload: ReviewUpdateRequest): Promise<ReviewStatusResponse> {
  return request<ReviewStatusResponse>(
    `/api/ai/review/${runId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: payload.status,
        notes: payload.notes ?? payload.observations ?? "",
        observations: payload.observations ?? payload.notes ?? "",
        reviewer: payload.reviewer ?? "Reviewer",
      }),
    },
    () => {
      mockRun = {
        ...normalizeRun(mockRun),
        review: {
          runId,
          status: payload.status,
          notes: payload.notes ?? payload.observations ?? "",
          observations: payload.observations ?? payload.notes ?? "",
          reviewer: payload.reviewer ?? "Reviewer",
          updatedAt: new Date().toISOString(),
        },
      };
      return mockRun.review ?? normalizeReview(runId, undefined);
    },
  );
}
