import { API_BASE_URL } from "./api";
import { authHeaders, refreshDoctorSession } from "./authClient";
import type { AssetName, DiagnosticEndpointResponse, InputResponse, MultiplanarRunPayload, MultiplanarRunResponse, RunReviewRequest, RunReviewResponse } from "./multiplanarRunTypes";
import type { MultiplanarContract } from "./multiplanarTypes";
import type { Plane } from "./appTypes";

export type ModelSyncResponse = Record<string, unknown> & {
  status?: string;
  readyForRealInference?: boolean;
  defaultInferenceMode?: string;
  proxiedByBackend?: boolean;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly traceId?: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

function responseString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function backendErrorFrom(response: Response, path: string, traceId: string) {
  let body: Record<string, unknown> | undefined;
  try {
    const parsed = await response.clone().json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    body = undefined;
  }
  const code = responseString(body?.code) ?? responseString(body?.errorCode) ?? responseString(body?.error);
  const backendMessage = responseString(body?.message) ?? responseString(body?.detail);
  const message = code === "AI_MULTIPLANAR_CONTRACT_VIOLATION" || code === "AI_CONTRACT_VIOLATION"
    ? "El modelo sagital no devolvió el contrato real esperado."
    : backendMessage ?? `Backend respondió ${response.status}`;
  return new BackendApiError(message, response.status, path, traceId, code);
}

async function multiplanarRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const traceId = `frontend-multiplanar-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const isFormData = init?.body instanceof FormData;
  const requestInit = (): RequestInit => ({
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      "X-Trace-Id": traceId,
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  let response = await fetch(`${API_BASE_URL}${path}`, requestInit());
  if (response.status === 401) {
    await refreshDoctorSession();
    response = await fetch(`${API_BASE_URL}${path}`, requestInit());
  }
  if (!response.ok) throw await backendErrorFrom(response, path, traceId);
  return await response.json() as T;
}

export async function uploadAiInput(file: File, caseId: string, plane: Plane): Promise<InputResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("caseId", caseId);
  formData.append("plane", plane);
  return multiplanarRequest<InputResponse>("/api/ai/inputs", {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
}

export async function getMultiplanarContract(): Promise<MultiplanarContract> {
  return multiplanarRequest<MultiplanarContract>("/api/ai/multiplanar/contract");
}

export async function getAiHealthStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/health");
}

export async function getAiReadinessStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/readiness");
}

export async function getAiModelsStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/models");
}

export async function verifyAiModelsStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/models/verify");
}

export async function getAiRuntimeStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/models/runtime");
}

export async function getSystemDiagnosticsStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/system/diagnostics");
}

export async function syncRealModelArtifacts(force = false): Promise<ModelSyncResponse> {
  return multiplanarRequest<ModelSyncResponse>(`/api/ai/models/sync?force=${force}`, { method: "POST" });
}

export async function runMultiplanarAnalysis(payload: MultiplanarRunPayload): Promise<MultiplanarRunResponse> {
  return multiplanarRequest<MultiplanarRunResponse>("/api/ai/multiplanar/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getRunReview(multiplanarRunId: string): Promise<RunReviewResponse> {
  return multiplanarRequest<RunReviewResponse>(`/api/ai/runs/${encodeURIComponent(multiplanarRunId)}/review`);
}

export async function submitRunReview(multiplanarRunId: string, payload: RunReviewRequest, method: "POST" | "PUT" = "POST"): Promise<RunReviewResponse> {
  return multiplanarRequest<RunReviewResponse>(`/api/ai/runs/${encodeURIComponent(multiplanarRunId)}/review`, {
    method,
    body: JSON.stringify(payload),
  });
}

export function aiAssetUrl(runId: string, plane: Plane, assetName: AssetName): string {
  return `${API_BASE_URL}/api/ai/assets/${encodeURIComponent(runId)}/${plane}/${assetName}`;
}
