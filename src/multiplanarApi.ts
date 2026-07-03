import { API_BASE_URL } from "./api";
import { authHeaders, refreshDoctorSession } from "./authClient";
import type { MultiplanarRunRequest, MultiplanarRunResponse } from "./multiplanarRunTypes";
import type { MultiplanarContract } from "./multiplanarTypes";

export type ModelSyncResponse = Record<string, unknown> & {
  status?: string;
  readyForRealInference?: boolean;
  defaultInferenceMode?: string;
  proxiedByBackend?: boolean;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

async function multiplanarRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const traceId = `frontend-multiplanar-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requestInit = (): RequestInit => ({
    ...init,
    headers: {
      "Content-Type": "application/json",
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
  if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
  return await response.json() as T;
}

export async function getMultiplanarContract(): Promise<MultiplanarContract> {
  return multiplanarRequest<MultiplanarContract>("/api/ai/multiplanar/contract");
}

export async function syncRealModelArtifacts(force = false): Promise<ModelSyncResponse> {
  return multiplanarRequest<ModelSyncResponse>(`/api/ai/models/sync?force=${force}`, { method: "POST" });
}

export async function runMultiplanarAnalysis(payload: MultiplanarRunRequest): Promise<MultiplanarRunResponse> {
  return multiplanarRequest<MultiplanarRunResponse>("/api/ai/multiplanar/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
