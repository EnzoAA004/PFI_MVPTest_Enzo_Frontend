import type { StudyDetailResponse, StudyRow } from "./appTypes";

const SELECTED_STUDY_KEY = "pfi.selectedStudyDetail";
export const SELECTED_STUDY_EVENT = "pfi:selected-study-updated";

export function saveSelectedStudyDetail(detail: StudyDetailResponse) {
  sessionStorage.setItem(SELECTED_STUDY_KEY, JSON.stringify(detail));
  window.dispatchEvent(new Event(SELECTED_STUDY_EVENT));
}

export function loadSelectedStudyDetail(): StudyDetailResponse | null {
  try {
    const raw = sessionStorage.getItem(SELECTED_STUDY_KEY);
    return raw ? JSON.parse(raw) as StudyDetailResponse : null;
  } catch {
    return null;
  }
}

export function saveSelectedStudyFallback(study: StudyRow) {
  const runs = study.runId ? [{
    runId: study.runId,
    caseId: study.caseId,
    plane: study.plane,
    modelKey: study.modelKey,
    modelStatus: study.modelStatus,
    reviewStatus: study.reviewStatus,
  }] : [];
  saveSelectedStudyDetail({
    status: "fallback",
    study,
    runs,
    review: study.runId ? { runId: study.runId, status: study.reviewStatus } : undefined,
    measurements: [],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
  });
}
