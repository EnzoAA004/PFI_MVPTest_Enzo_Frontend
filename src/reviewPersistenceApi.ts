import { API_BASE_URL, ApiError } from "./api";
import { authHeaders, refreshDoctorSession } from "./authClient";
import { isRealDataMode } from "./dataMode";
import { toSafeFrontendError } from "./security/safeError";
import { generateTraceId } from "./security/traceId";
import type { AuditEvent, Measurement, ReviewStatusResponse } from "./appTypes";

function requestInit(init: RequestInit | undefined, traceId: string): RequestInit {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": traceId,
      ...authHeaders(),
      ...init?.headers,
    },
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const traceId = generateTraceId("frontend-review");
  let response = await fetch(`${API_BASE_URL}${path}`, requestInit(init, traceId));
  if (response.status === 401) {
    // A failed refresh means the session is gone: surface that as the real
    // failure (401) instead of silently retrying with the stale token, so
    // callers observe a genuine "session invalid" state.
    await refreshDoctorSession();
    response = await fetch(`${API_BASE_URL}${path}`, requestInit(init, traceId));
  }
  if (!response.ok) {
    const safe = toSafeFrontendError(response.status, { traceId });
    throw new ApiError(safe.message, { status: response.status, path, traceId });
  }
  return (await response.json()) as T;
}

export type BackendReviewSnapshot = {
  reviews: ReviewStatusResponse[];
  measurementsByRunId: Record<string, Measurement[]>;
  auditTrail: AuditEvent[];
};

type BackendAuditEvent = AuditEvent & { reviewer?: string };

function normalizeAuditEvent(event: BackendAuditEvent): AuditEvent {
  return {
    id: event.id,
    timestamp: event.timestamp,
    actor: event.actor ?? event.reviewer ?? "System",
    action: event.action,
    detail: event.detail,
  };
}

function normalizeSnapshot(snapshot: BackendReviewSnapshot): BackendReviewSnapshot {
  return {
    reviews: snapshot.reviews ?? [],
    measurementsByRunId: snapshot.measurementsByRunId ?? {},
    auditTrail: (snapshot.auditTrail ?? []).map((event) => normalizeAuditEvent(event as BackendAuditEvent)),
  };
}

export async function getBackendReviewSnapshot() {
  if (isRealDataMode) throw new Error("Endpoint legacy /api/ai/review/history deshabilitado en modo real.");
  const snapshot = await request<BackendReviewSnapshot>("/api/ai/review/history");
  return normalizeSnapshot(snapshot);
}

export function saveBackendMeasurements(runId: string, measurements: Measurement[], reviewer: string, detail: string) {
  if (isRealDataMode) return Promise.reject(new Error("Endpoint legacy /api/ai/review/{runId}/measurements deshabilitado en modo real."));
  return request<Measurement[]>(`/api/ai/review/${runId}/measurements`, {
    method: "PUT",
    body: JSON.stringify({ measurements, reviewer, detail }),
  });
}

export async function appendBackendAudit(reviewer: string, action: string, detail: string) {
  const event = await request<BackendAuditEvent>("/api/ai/audit", {
    method: "POST",
    body: JSON.stringify({ reviewer, action, detail }),
  });
  return normalizeAuditEvent(event);
}
