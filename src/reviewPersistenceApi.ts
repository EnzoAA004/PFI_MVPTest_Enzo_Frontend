import { API_BASE_URL } from "./api";
import { authHeaders, refreshDoctorSession } from "./authClient";
import type { AuditEvent, Measurement, ReviewStatusResponse } from "./appTypes";

function requestInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await fetch(`${API_BASE_URL}${path}`, requestInit(init));
  if (response.status === 401) {
    try {
      await refreshDoctorSession();
      response = await fetch(`${API_BASE_URL}${path}`, requestInit(init));
    } catch {
      // Keep the original failure behavior below.
    }
  }
  if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
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
  const snapshot = await request<BackendReviewSnapshot>("/api/ai/review/history");
  return normalizeSnapshot(snapshot);
}

export function saveBackendMeasurements(runId: string, measurements: Measurement[], reviewer: string, detail: string) {
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
