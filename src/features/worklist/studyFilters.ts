import type { StudyRow } from "../../appTypes";
import { displayReviewStatus } from "../../clinicalDisplay";
import { displayLatestRunId, displayModelKey, displayPrimaryPlane, displayStudyDate, displaySubjectRef } from "../../studyDisplay";

/**
 * Worklist filtering, kept pure so it can be tested without React.
 *
 * Replaces the two byte-identical `matchesQuery` implementations that lived in
 * StudiesView and DashboardView, and the `mode: "all" | "queue"` flag that made
 * the same screen render under three different routes.
 */

export type WorklistFilterId = "pending" | "observed" | "high" | "closed" | "all";

export type WorklistFilter = {
  id: WorklistFilterId;
  label: string;
  /** Longer form for the empty state, so it reads as a sentence. */
  emptyLabel: string;
  matches: (study: StudyRow) => boolean;
};

/**
 * Filter order follows reading urgency, not alphabetical or status-enum order:
 * what needs attention first is leftmost.
 */
export const WORKLIST_FILTERS: WorklistFilter[] = [
  { id: "pending", label: "Pendientes", emptyLabel: "pendientes de revisión", matches: (s) => s.reviewStatus === "pendiente" },
  { id: "observed", label: "Observados", emptyLabel: "observados", matches: (s) => s.reviewStatus === "observado" },
  { id: "high", label: "Prioridad alta", emptyLabel: "de prioridad alta", matches: (s) => s.priority === "alta" },
  { id: "closed", label: "Finalizados", emptyLabel: "finalizados", matches: (s) => s.reviewStatus === "aceptado" || s.reviewStatus === "descartado" },
  { id: "all", label: "Total", emptyLabel: "en el repositorio", matches: () => true },
];

export function matchesQuery(study: StudyRow, query: string) {
  if (!query.trim()) return true;
  const normalized = query.trim().toLowerCase();
  return [
    study.caseId,
    displaySubjectRef(study.subjectRef),
    displayLatestRunId(study.latestRunId),
    displayPrimaryPlane(study.primaryPlane),
    displayStudyDate(study.studyDate),
    displayModelKey(study.modelKey),
    study.modelStatus,
    study.reviewStatus,
    displayReviewStatus(study.reviewStatus),
    study.priority,
    study.description,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

export function filterStudies(studies: StudyRow[], filterId: WorklistFilterId, query: string) {
  const filter = WORKLIST_FILTERS.find((item) => item.id === filterId) ?? WORKLIST_FILTERS[WORKLIST_FILTERS.length - 1];
  return studies.filter((study) => filter.matches(study) && matchesQuery(study, query));
}

/**
 * Counts are computed over the search-filtered set, so a chip never advertises
 * rows the current search would hide.
 */
export function countsByFilter(studies: StudyRow[], query: string): Record<WorklistFilterId, number> {
  const searched = studies.filter((study) => matchesQuery(study, query));
  return WORKLIST_FILTERS.reduce((counts, filter) => {
    counts[filter.id] = searched.filter(filter.matches).length;
    return counts;
  }, {} as Record<WorklistFilterId, number>);
}
