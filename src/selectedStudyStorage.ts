import type { StudyDetailResponse, StudyRow } from "./appTypes";

const SELECTED_STUDY_KEY = "pfi.selectedStudyDetail";

export function saveSelectedStudyDetail(detail: StudyDetailResponse) {
  sessionStorage.setItem(SELECTED_STUDY_KEY, JSON.stringify(detail));
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
  saveSelectedStudyDetail({
    status: "fallback",
    study,
    runs: [{
      runId: study.runId ?? "demo-run",
      caseId: study.caseId,
      plane: study.plane,
      modelKey: study.modelKey,
      modelStatus: study.modelStatus,
      reviewStatus: study.reviewStatus,
    }],
    review: { runId: study.runId, status: study.reviewStatus },
    measurements: [],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
  });
}
