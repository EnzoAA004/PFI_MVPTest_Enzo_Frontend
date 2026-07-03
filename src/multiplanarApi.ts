import { API_BASE_URL } from "./api";
import type { MultiplanarContract } from "./multiplanarTypes";

export type ModelSyncResponse = Record<string, unknown> & {
  status?: string;
  readyForRealInference?: boolean;
  defaultInferenceMode?: string;
  proxiedByBackend?: boolean;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export async function getMultiplanarContract(): Promise<MultiplanarContract> {
  const response = await fetch(`${API_BASE_URL}/api/ai/multiplanar/contract`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
  return await response.json() as MultiplanarContract;
}

export async function syncRealModelArtifacts(force = false): Promise<ModelSyncResponse> {
  const response = await fetch(`${API_BASE_URL}/api/ai/models/sync?force=${force}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
  return await response.json() as ModelSyncResponse;
}
