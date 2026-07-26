import { useMemo, useState } from "react";
import type { StudyRow } from "../appTypes";
import { displayLatestRunId, displayModelKey, displayPrimaryPlane, displayStudyDate, displaySubjectRef } from "../studyDisplay";
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
  return [
    study.caseId,
    displaySubjectRef(study.subjectRef),
    displayLatestRunId(study.latestRunId),
    displayPrimaryPlane(study.primaryPlane),
    displayStudyDate(study.studyDate),
    displayModelKey(study.modelKey),
    study.modelStatus,
    study.reviewStatus,
    study.priority,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
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
          <p>{isQueue ? "Cola de revision" : "Estudios"}</p>
          <h1>{isQueue ? "Estudios pendientes de revision" : "Repositorio de estudios"}</h1>
        </div>
        <div className="screen-summary">
          <strong>{visibleStudies.length}</strong>
          <span>{isQueue ? `${studies.length} estudios en la lista` : "estudios reales visibles"}</span>
        </div>
      </section>

      <section className="panel-card worklist-panel">
        <div className="section-title">
          <div>
            <h2>{isQueue ? "Lista pendiente" : "Todos los estudios"}</h2>
            <p className="muted compact-copy">
              {isQueue ? "Filtrado solo a revisiones pendientes u observadas." : "Estudios persistidos en el repositorio del proyecto."}
            </p>
          </div>
        </div>
        <div className="worklist-filter-shell">
          <div className="worklist-search-row single-action">
            <label className="worklist-search-input">
              <span>Buscar</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Caso, referencia, corrida, modelo, estado..." type="search" />
            </label>
          </div>
        </div>
        {loading ? (
          <div className="panel-hidden-placeholder">Consultando estudios persistidos.</div>
        ) : visibleStudies.length ? (
          <WorklistTable studies={visibleStudies} onOpenReview={onOpenReview} />
        ) : (
          <div className="panel-hidden-placeholder">
            {isQueue ? "No hay estudios que requieran revision." : "Base disponible sin estudios persistidos para esta lista."}
          </div>
        )}
      </section>
    </div>
  );
}
