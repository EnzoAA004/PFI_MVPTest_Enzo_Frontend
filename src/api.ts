import { sampleModels, sampleRun } from "./mock/sampleRun";
import type { AgentDecision, AiModel, AiRunResponse, PipelineRunRequest, ReviewStatusResponse, ReviewUpdateRequest } from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const FALLBACK_RUN_ID = "demo-run-2026-001";
const fallbackAgentDecision: AgentDecision = {
  priority: "media",
  status: "requiere_revision",
  flags: ["revision_profesional_requerida"],
  reasons: ["La salida tecnica debe ser revisada por un profesional."],
  humanReviewRequired: true,
};

let demoMode = USE_MOCK;
let mockRun: AiRunResponse = sampleRun;

export const isDemoMode = () => demoMode;

function normalizeModels(response: unknown): AiModel[] {
  if (Array.isArray(response)) {
    return response as AiModel[];
  }

  if (response && typeof response === "object" && "models" in response) {
    const modelsValue = (response as { models?: unknown }).models;
    if (Array.isArray(modelsValue)) {
      return modelsValue as AiModel[];
    }

    if (modelsValue && typeof modelsValue === "object") {
      return Object.entries(modelsValue).map(([key, value]) => {
        const model = value && typeof value === "object" ? value as Record<string, unknown> : {};
        const plane = model.plane === "axial" || model.plane === "sagittal" ? model.plane : undefined;
        return {
          key,
          name: key,
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
    observations: review?.observations ?? "",
    reviewedAt: review?.reviewedAt,
  };
}

export function normalizeRun(run?: AiRunResponse): AiRunResponse {
  const sampleAgentDecision = sampleRun.agentDecision ?? fallbackAgentDecision;
  const runId = run?.runId ?? sampleRun.runId ?? FALLBACK_RUN_ID;
  return {
    ...sampleRun,
    ...run,
    runId,
    agentDecision: {
      ...sampleAgentDecision,
      ...run?.agentDecision,
      flags: run?.agentDecision?.flags ?? sampleAgentDecision.flags,
      reasons: run?.agentDecision?.reasons ?? sampleAgentDecision.reasons,
      humanReviewRequired: run?.agentDecision?.humanReviewRequired ?? true,
    },
    measurements: run?.measurements ?? sampleRun.measurements,
    review: normalizeReview(runId, run?.review),
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
      throw new Error(`Backend respondio ${response.status}`);
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

export async function runPipeline(requestPayload: PipelineRunRequest): Promise<AiRunResponse> {
  const response = await request<AiRunResponse>(
    "/api/ai/pipeline/run",
    {
      method: "POST",
      body: JSON.stringify(requestPayload),
    },
    () => {
      mockRun = normalizeRun({
        ...sampleRun,
        caseId: requestPayload.caseId,
        plane: requestPayload.plane,
        modelKey: requestPayload.modelKey,
        createdAt: new Date().toISOString(),
      });
      return mockRun;
    },
  );
  return normalizeRun(response);
}

export async function getAgentReport(runId: string): Promise<AiRunResponse> {
  const response = await request<AiRunResponse>(`/api/ai/agent/report/${runId}`, undefined, () => normalizeRun({
    ...mockRun,
    runId,
  }));
  return normalizeRun(response);
}

export async function updateReview(runId: string, payload: ReviewUpdateRequest): Promise<ReviewStatusResponse> {
  return request<ReviewStatusResponse>(
    `/api/ai/review/${runId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    () => {
      mockRun = {
        ...normalizeRun(mockRun),
        review: {
          runId,
          status: payload.status,
          observations: payload.observations,
          reviewedAt: new Date().toISOString(),
        },
      };
      return mockRun.review ?? normalizeReview(runId, undefined);
    },
  );
}
