import { API_BASE_URL, ApiError } from "./api";
import { authHeaders, refreshDoctorSession } from "./authClient";
import { toSafeFrontendError } from "./security/safeError";
import { generateTraceId } from "./security/traceId";

export type PipelineContractSchema = {
  schemaVersion?: string;
  status?: string;
  purpose?: string;
  proxiedByBackend?: boolean;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
  message?: string;
  rootFields?: Record<string, string>;
  aiOutput?: Record<string, unknown>;
  quality?: Record<string, unknown>;
  guarantees?: string[];
};

export async function getPipelineContractSchema(): Promise<PipelineContractSchema> {
  const path = "/api/ai/pipeline/schema";
  const traceId = generateTraceId("frontend-pipeline");
  const requestInit = (): RequestInit => ({
    headers: { "Content-Type": "application/json", "X-Trace-Id": traceId, ...authHeaders() },
  });
  let response = await fetch(`${API_BASE_URL}${path}`, requestInit());
  if (response.status === 401) {
    await refreshDoctorSession();
    response = await fetch(`${API_BASE_URL}${path}`, requestInit());
  }
  if (!response.ok) {
    const safe = toSafeFrontendError(response.status, { traceId });
    throw new ApiError(safe.message, { status: response.status, path, traceId });
  }
  return (await response.json()) as PipelineContractSchema;
}
