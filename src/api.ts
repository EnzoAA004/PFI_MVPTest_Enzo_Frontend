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

function normalizeMeasurements(value: unknown): Measurement[] {
  if (Array.isArray(value)) {
    return value as Measurement[];
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.values)) {
      return record.values as Measurement[];
    }
    if (typeof record.status === "string" || typeof record.description === "string") {
      return [{
        id: "pipeline-status",
        label: typeof record.description === "string" ? record.description : "Estado del pipeline tecnico",
        value: typeof record.status === "string" ? record.status : "pendiente",
        unit: "",
      }];
    }
  }

  return sampleRun.measurements ?? [];
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

    if (!response.ok) {
      let backendMessage = "";
      try {
        const errorBody = await response.json();
        backendMessage = typeof errorBody.message === "string" ? `: ${errorBody.message}` : "";
      } catch {
        backendMessage = "";
      }
      throw new Error(`Backend respondio ${response.status}${backendMessage}`);
    }

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
  ).then((review) => normalizeReview(runId, review));
}
