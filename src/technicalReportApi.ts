import { API_BASE_URL, ApiError } from "./api";
import { authHeaders, refreshDoctorSession } from "./authClient";
import { isAuthorizedBackendUrl } from "./security/originPolicy";
import { toSafeFrontendError } from "./security/safeError";
import { generateTraceId } from "./security/traceId";

export async function fetchTechnicalReportPayload(runId: string): Promise<unknown> {
  const url = `${API_BASE_URL}/api/ai/agent/report/${runId}`;
  if (!isAuthorizedBackendUrl(url)) {
    throw new ApiError("Origen del reporte técnico no autorizado.", { path: url });
  }

  const traceId = generateTraceId("frontend-report");
  const requestInit = (): RequestInit => ({
    headers: { "Content-Type": "application/json", "X-Trace-Id": traceId, ...authHeaders() },
  });
  let response = await fetch(url, requestInit());
  if (response.status === 401) {
    await refreshDoctorSession();
    response = await fetch(url, requestInit());
  }
  if (!response.ok) {
    const safe = toSafeFrontendError(response.status, { traceId });
    throw new ApiError(safe.message, { status: response.status, path: url, traceId });
  }
  return response.json();
}
