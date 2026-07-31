import { useMemo, useState } from "react";
import { NewAnalysisDrawer } from "./NewAnalysisDrawer";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";
import type { Priority, ReviewStatus, StudyRow } from "../../appTypes";
import { displayReviewStatus } from "../../clinicalDisplay";
import { displayModelKey, displayStudyDate, displaySubjectRef, studyHasReviewableRun } from "../../studyDisplay";
import { WORKLIST_FILTERS, countsByFilter, filterStudies, type WorklistFilterId } from "./studyFilters";

/**
 * Worklist — the entry point of the application.
 *
 * Replaces DashboardView + StudiesView + the review queue, which were the same
 * table under three routes. The four metric cards are gone: their numbers now
 * live inside the filter chips, where they are both the count and the way to act
 * on it, instead of occupying the top third of the screen.
 *
 * Density is deliberate. A worklist is scanned, not read.
 */

const PAGE_SIZE = 25;

type SortKey = "caseId" | "subjectRef" | "studyDate" | "modelKey" | "reviewStatus" | "priority";
type SortDirection = "asc" | "desc";

const reviewWeight: Record<ReviewStatus, number> = { observado: 0, pendiente: 1, aceptado: 2, descartado: 3 };
const priorityWeight: Record<Priority, number> = { alta: 0, media: 1, baja: 2 };

function sortValue(study: StudyRow, key: SortKey): string | number {
  if (key === "reviewStatus") return reviewWeight[study.reviewStatus] ?? 99;
  if (key === "priority") return priorityWeight[study.priority] ?? 99;
  if (key === "studyDate") return Date.parse(study.studyDate ?? "") || 0;
  if (key === "subjectRef") return String(study.subjectRef ?? "").toLowerCase();
  if (key === "modelKey") return String(study.modelKey ?? "").toLowerCase();
  return String(study.caseId ?? "").toLowerCase();
}

function compareStudies(a: StudyRow, b: StudyRow, key: SortKey, direction: SortDirection) {
  const first = sortValue(a, key);
  const second = sortValue(b, key);
  const result = typeof first === "number" && typeof second === "number" ? first - second : String(first).localeCompare(String(second));
  return direction === "asc" ? result : -result;
}

function rowKey(study: StudyRow) {
  return study.latestRunId ?? study.runId ?? `${study.caseId}-${study.studyDate ?? "s/f"}-${study.primaryPlane ?? "s/p"}`;
}

interface WorklistProps {
  studies: StudyRow[];
  loading?: boolean;
  onOpenReview: (study: StudyRow) => void;
  /** Se invoca con el caseId cuando una corrida nueva quedó lista para leer. */
  onAnalysisReady: (caseId: string) => void;
}

export function Worklist({ studies, loading = false, onOpenReview, onAnalysisReady }: WorklistProps) {
  /*
   * Cargar un estudio es un panel sobre la lista, no un destino aparte: el
   * asistente de cuatro pasos sacaba al médico de su lista de trabajo para
   * volver a dejarlo ahí cinco pantallas después.
   */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterId, setFilterId] = useState<WorklistFilterId>("pending");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("studyDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(0);

  const counts = useMemo(() => countsByFilter(studies, query), [studies, query]);
  const rows = useMemo(
    () => filterStudies(studies, filterId, query).sort((a, b) => compareStudies(a, b, sortKey, sortDirection)),
    [studies, filterId, query, sortKey, sortDirection],
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const activeFilter = WORKLIST_FILTERS.find((item) => item.id === filterId) ?? WORKLIST_FILTERS[0];

  /*
   * Abrir un estudio es avisar quién se eligió, nada más. Antes la fila además
   * escribía el detalle en sessionStorage y disparaba su propio fetchStudyDetail
   * en paralelo al de App: las dos respuestas competían por la misma clave y la
   * sala de lectura leía la que llegara última, por eso a veces hacía falta
   * hacer clic dos veces. El detalle lo carga y lo posee App.
   */
  function openStudy(study: StudyRow) {
    onOpenReview(study);
  }

  function changeSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "studyDate" || key === "priority" || key === "reviewStatus" ? "desc" : "asc");
    }
    setPage(0);
  }

  function SortHeader({ column, children, align }: { column: SortKey; children: React.ReactNode; align?: "end" }) {
    const active = sortKey === column;
    const Icon = !active ? ChevronsUpDown : sortDirection === "asc" ? ChevronUp : ChevronDown;
    return (
      <th aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} data-align={align}>
        <button className={`wl-sort${active ? " is-active" : ""}`} onClick={() => changeSort(column)} type="button">
          <span>{children}</span>
          <Icon aria-hidden size={13} />
        </button>
      </th>
    );
  }

  return (
    <div className="wl">
      <header className="wl-header">
        <div className="wl-title">
          <h1>Lista de trabajo</h1>
          <span className="wl-total">{rows.length} de {studies.length} estudios</span>
        </div>
        <div className="wl-actions">
          <label className="wl-search">
            <Search aria-hidden size={14} />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(0); }}
              placeholder="Buscar caso, paciente, corrida, modelo…"
              type="search"
              aria-label="Buscar estudios"
            />
          </label>
          <button className="wl-primary" onClick={() => setDrawerOpen(true)} type="button">Nuevo análisis</button>
        </div>
      </header>

      <nav className="wl-filters" aria-label="Filtros de la lista de trabajo">
        {WORKLIST_FILTERS.map((filter) => (
          <button
            key={filter.id}
            className={`wl-chip${filter.id === filterId ? " is-active" : ""}`}
            onClick={() => { setFilterId(filter.id); setPage(0); }}
            type="button"
            aria-pressed={filter.id === filterId}
          >
            {filter.label}
            <em>{counts[filter.id]}</em>
          </button>
        ))}
      </nav>

      <div className="wl-table-wrap" role="region" aria-label="Estudios" tabIndex={0}>
        <table className="wl-table">
          <thead>
            <tr>
              <th className="wl-col-status"><span className="sr-only">Estado</span></th>
              <SortHeader column="caseId">Caso</SortHeader>
              <SortHeader column="subjectRef">Paciente</SortHeader>
              <SortHeader column="studyDate">Fecha</SortHeader>
              <th>Planos</th>
              <SortHeader column="modelKey">Modelo</SortHeader>
              <SortHeader column="reviewStatus">Revisión</SortHeader>
              <SortHeader column="priority" align="end">Prioridad</SortHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((study) => {
              const reviewable = studyHasReviewableRun(study);
              return (
                <tr
                  key={rowKey(study)}
                  className="wl-row"
                  tabIndex={0}
                  onClick={() => openStudy(study)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openStudy(study); }
                  }}
                >
                  <td className="wl-col-status"><span className={`wl-dot wl-dot-${study.reviewStatus}`} aria-hidden /></td>
                  <td className="wl-case">
                    <span className="wl-case-id">{study.caseId}</span>
                    {study.description ? <span className="wl-case-desc">{study.description}</span> : null}
                  </td>
                  <td className="wl-num">{displaySubjectRef(study.subjectRef)}</td>
                  <td className="wl-num">{displayStudyDate(study.studyDate)}</td>
                  <td>
                    <span className="wl-planes">
                      {study.planes.length
                        ? study.planes.map((plane) => <em key={plane} className="wl-plane">{plane === "sagittal" ? "SAG" : "AX"}</em>)
                        : <span className="wl-empty-cell">—</span>}
                    </span>
                  </td>
                  <td>
                    {reviewable
                      ? <span className="wl-model">{displayModelKey(study.modelKey)}</span>
                      : <span className="wl-empty-cell">sin corrida</span>}
                  </td>
                  <td>{displayReviewStatus(study.reviewStatus)}</td>
                  <td className="wl-align-end">
                    {study.priority === "alta"
                      ? <span className="wl-priority-high">Alta</span>
                      : <span className="wl-empty-cell">{study.priority === "media" ? "Media" : "Baja"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {loading ? <p className="wl-state">Consultando estudios persistidos…</p> : null}
        {!loading && !rows.length ? (
          <p className="wl-state">
            {query.trim()
              ? `Ningún estudio coincide con “${query.trim()}”.`
              : `No hay estudios ${activeFilter.emptyLabel}.`}
          </p>
        ) : null}
      </div>

      {pageCount > 1 ? (
        <footer className="wl-pagination">
          <span>{safePage * PAGE_SIZE + 1}–{Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} de {rows.length}</span>
          <div>
            <button disabled={safePage === 0} onClick={() => setPage((c) => Math.max(0, c - 1))} type="button">Anterior</button>
            <span>{safePage + 1} / {pageCount}</span>
            <button disabled={safePage >= pageCount - 1} onClick={() => setPage((c) => Math.min(pageCount - 1, c + 1))} type="button">Siguiente</button>
          </div>
        </footer>
      ) : null}

      {drawerOpen && (
        <NewAnalysisDrawer
          onAnalysisReady={(caseId) => { setDrawerOpen(false); onAnalysisReady(caseId); }}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
