import { API_BASE_URL } from "./api";
import { authHeaders } from "./authClient";
import type { AuditEvent, Measurement, ReviewStatusResponse } from "./appTypes";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
  return (await response.json()) as T;
}

export type BackendReviewSnapshot = {
  reviews: ReviewStatusResponse[];
  measurementsByRunId: Record<string, Measurement[]>;
  auditTrail: AuditEvent[];
};

export function getBackendReviewSnapshot() {
  return request<BackendReviewSnapshot>("/api/ai/review/history");
}

export function saveBackendMeasurements(runId: string, measurements: Measurement[], reviewer: string, detail: string) {
  return request<Measurement[]>(`/api/ai/review/${runId}/measurements`, {
    method: "PUT",
    body: JSON.stringify({ measurements, reviewer, detail }),
  });
}

export function appendBackendAudit(reviewer: string, action: string, detail: string) {
  return request<AuditEvent>("/api/ai/audit", {
    method: "POST",
    body: JSON.stringify({ reviewer, action, detail }),
  });
}
