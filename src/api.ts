import { sampleModels, sampleRun } from "./mock/sampleRun";
import type { AiModel, AiRunResponse, PipelineRunRequest, ReviewStatusResponse, ReviewUpdateRequest } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

let demoMode = USE_MOCK;
let mockRun: AiRunResponse = sampleRun;

export const isDemoMode = () => demoMode;

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
  return request<AiModel[]>("/api/ai/models", undefined, () => sampleModels);
}

export async function runPipeline(requestPayload: PipelineRunRequest): Promise<AiRunResponse> {
  return request<AiRunResponse>(
    "/api/ai/pipeline/run",
    {
      method: "POST",
      body: JSON.stringify(requestPayload),
    },
    () => {
      mockRun = {
        ...sampleRun,
        caseId: requestPayload.caseId,
        plane: requestPayload.plane,
        modelKey: requestPayload.modelKey,
        createdAt: new Date().toISOString(),
      };
      return mockRun;
    },
  );
}

export async function getAgentReport(runId: string): Promise<AiRunResponse> {
  return request<AiRunResponse>(`/api/ai/agent/report/${runId}`, undefined, () => ({
    ...mockRun,
    runId,
  }));
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
        ...mockRun,
        review: {
          runId,
          status: payload.status,
          observations: payload.observations,
          reviewedAt: new Date().toISOString(),
        },
      };
      return mockRun.review;
    },
  );
}
