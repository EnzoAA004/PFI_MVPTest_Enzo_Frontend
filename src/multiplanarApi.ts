import { API_BASE_URL } from "./api";
import { authHeaders, refreshDoctorSession } from "./authClient";
import type { AssetName, InputResponse, MultiplanarRunPayload, MultiplanarRunResponse, RunReviewRequest, RunReviewResponse } from "./multiplanarRunTypes";
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
  ) {
    super(message);
    this.name = "BackendApiError";
  }
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
  if (!response.ok) throw new BackendApiError(`Backend respondio ${response.status}`, response.status, path, traceId);
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
