import { asyncGetItem, asyncSetItem } from "./browserStorage";
import { initialAuditTrail, patientStudies } from "./data/mockStudies";
import type { AiRunResponse, AuditEvent, Measurement, ReviewHistoryState, ReviewStatusResponse } from "./appTypes";

const STORAGE_KEY = "lumbar-mri-review-history-v1";

const emptyState: ReviewHistoryState = {
  runs: [],
  measurementsByRunId: {},
  reviewsByRunId: {},
  auditTrail: initialAuditTrail,
  patientStudies,
};

let cachedState: ReviewHistoryState = emptyState;

export async function hydrateReviewHistory(): Promise<ReviewHistoryState> {
  try {
    const raw = await asyncGetItem(STORAGE_KEY);
    cachedState = raw ? ({ ...emptyState, ...JSON.parse(raw) } as ReviewHistoryState) : emptyState;
    return cachedState;
  } catch {
    cachedState = emptyState;
    return cachedState;
  }
}

export function loadReviewHistory(): ReviewHistoryState {
  return cachedState;
}

export function saveReviewHistory(state: ReviewHistoryState) {
  cachedState = state;
  void asyncSetItem(STORAGE_KEY, JSON.stringify(state));
}

export function saveRun(run: AiRunResponse) {
  const state = loadReviewHistory();
  const runId = run.runId ?? "local-run";
  const runs = [run, ...state.runs.filter((item) => item.runId !== runId)].slice(0, 10);
  saveReviewHistory({ ...state, runs });
}

export function saveMeasurementEdits(runId: string, measurements: Measurement[]) {
  const state = loadReviewHistory();
  saveReviewHistory({
    ...state,
    measurementsByRunId: {
      ...state.measurementsByRunId,
      [runId]: measurements,
    },
  });
}

export function saveProfessionalReview(runId: string, review: ReviewStatusResponse) {
  const state = loadReviewHistory();
  saveReviewHistory({
    ...state,
    reviewsByRunId: {
      ...state.reviewsByRunId,
      [runId]: review,
    },
  });
}

export function appendAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">) {
  const state = loadReviewHistory();
  const nextEvent: AuditEvent = {
    ...event,
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  const auditTrail = [nextEvent, ...state.auditTrail].slice(0, 50);
  saveReviewHistory({ ...state, auditTrail });
  return auditTrail;
}
