import { useMemo, useState } from "react";
import type { StudyRow } from "../appTypes";
import { WorklistTable } from "./WorklistTable";

type StudyListMode = "all" | "queue";

interface StudiesViewProps {
  studies: StudyRow[];
  mode: StudyListMode;
  loading?: boolean;
  onOpenReview: (study: StudyRow) => void;
}

function matchesQuery(study: StudyRow, query: string) {
  if (!query.trim()) return true;
  const normalized = query.trim().toLowerCase();
  return [study.caseId, study.patientId, study.runId, study.plane, study.studyDate, study.modelKey, study.modelStatus, study.reviewStatus, study.priority]
    .some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function isQueueItem(study: StudyRow) {
  return study.reviewStatus === "pendiente" || study.reviewStatus === "observado";
}

export function StudiesView({ studies, mode, loading = false, onOpenReview }: StudiesViewProps) {
  const [query, setQuery] = useState("");
  const baseStudies = useMemo(() => mode === "queue" ? studies.filter(isQueueItem) : studies, [mode, studies]);
  const visibleStudies = useMemo(() => baseStudies.filter((study) => matchesQuery(study, query)), [baseStudies, query]);
  const isQueue = mode === "queue";

  return (
    <div className="view-stack">
      <section className="page-heading compact-heading">
        <div>
          <p>{isQueue ? "Cola de revisión" : "Estudios"}</p>
          <h1>{isQueue ? "Estudios pendientes de revisión" : "Repositorio de estudios"}</h1>
        </div>
        <div className="screen-summary">
          <strong>{visibleStudies.length}</strong>
          <span>{isQueue ? `of ${studies.length} studies require review` : "real studies visible"}</span>
        </div>
      </section>

      <section className="panel-card worklist-panel">
        <div className="section-title">
          <div>
            <h2>{isQueue ? "Pending worklist" : "All studies"}</h2>
            <p className="muted compact-copy">
              {isQueue ? "Filtered to pending or observed reviews only." : "Complete study list from backend or configured demo fallback."}
            </p>
          </div>
        </div>
        <div className="worklist-filter-shell">
          <div className="worklist-search-row single-action">
            <label className="worklist-search-input">
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Case, patient, run, model, status..." type="search" />
            </label>
          </div>
        </div>
        {loading ? (
          <div className="panel-hidden-placeholder">Consulting studies from backend.</div>
        ) : visibleStudies.length ? (
          <WorklistTable studies={visibleStudies} onOpenReview={onOpenReview} />
        ) : (
          <div className="panel-hidden-placeholder">
            {isQueue ? "No hay estudios que requieran revisión." : "No hay estudios reales disponibles para esta lista."}
          </div>
        )}
      </section>
    </div>
  );
}
