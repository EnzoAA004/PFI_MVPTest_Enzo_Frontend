import { useMemo, useState } from "react";
import type { AuditEvent, Plane, Priority, ReviewStatus, StudiesSummary, StudyRow } from "../appTypes";
import { AuditTrail } from "./AuditTrail";
import { MetricCard } from "./MetricCard";
import { PrivacyBanner } from "./PrivacyBanner";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";
import { WorklistTable } from "./WorklistTable";

type QuickFilter = "todos" | "pendientes" | "observados" | "aprobados" | "prioridad";
type AllOption = "todos";

interface DashboardViewProps {
  studies: StudyRow[];
  auditTrail: AuditEvent[];
  onOpenReview: (study: StudyRow) => void;
  summary?: StudiesSummary;
}

const quickFilters: { id: QuickFilter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "pendientes", label: "Pendientes" },
  { id: "observados", label: "Observados" },
  { id: "aprobados", label: "Aprobados" },
  { id: "prioridad", label: "Prioridad alta" },
];

function uniqueValues<T extends string>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[])).sort((a, b) => a.localeCompare(b));
}

function matchesSearch(study: StudyRow, query: string) {
  if (!query.trim()) return true;
  const normalized = query.trim().toLowerCase();
  return [
    study.caseId,
    study.patientId,
    study.runId,
    study.plane,
    study.studyDate,
    study.modelKey,
    study.modelStatus,
    study.reviewStatus,
    study.priority,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function matchesQuickFilter(study: StudyRow, filter: QuickFilter) {
  if (filter === "pendientes") return study.reviewStatus === "pendiente";
  if (filter === "observados") return study.reviewStatus === "observado";
  if (filter === "aprobados") return study.reviewStatus === "aceptado";
  if (filter === "prioridad") return study.priority === "alta" || study.reviewStatus === "observado";
  return true;
}

function hasActiveAdvancedFilters(filters: {
  plane: Plane | AllOption;
  reviewStatus: ReviewStatus | AllOption;
  priority: Priority | AllOption;
  modelKey: string;
}) {
  return filters.plane !== "todos" || filters.reviewStatus !== "todos" || filters.priority !== "todos" || filters.modelKey !== "todos";
}

export function DashboardView({ studies, auditTrail, onOpenReview, summary }: DashboardViewProps) {
  const [query, setQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [plane, setPlane] = useState<Plane | AllOption>("todos");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | AllOption>("todos");
  const [priority, setPriority] = useState<Priority | AllOption>("todos");
  const [modelKey, setModelKey] = useState<string>("todos");

  const total = summary?.total ?? studies.length;
  const pending = summary?.pending ?? studies.filter((study) => study.reviewStatus === "pendiente" || study.reviewStatus === "observado").length;
  const completed = summary?.completed ?? studies.filter((study) => study.reviewStatus === "aceptado").length;
  const flagged = summary?.flagged ?? studies.filter((study) => study.priority === "alta" || study.reviewStatus === "observado").length;
  const modelOptions = useMemo(() => uniqueValues(studies.map((study) => study.modelKey)), [studies]);
  const filteredStudies = useMemo(() => studies.filter((study) => {
    if (!matchesSearch(study, query)) return false;
    if (!matchesQuickFilter(study, quickFilter)) return false;
    if (plane !== "todos" && study.plane !== plane) return false;
    if (reviewStatus !== "todos" && study.reviewStatus !== reviewStatus) return false;
    if (priority !== "todos" && study.priority !== priority) return false;
    if (modelKey !== "todos" && study.modelKey !== modelKey) return false;
    return true;
  }), [modelKey, plane, priority, query, quickFilter, reviewStatus, studies]);
  const latestStudy = filteredStudies[0] ?? studies[0];
  const activeAdvanced = hasActiveAdvancedFilters({ plane, reviewStatus, priority, modelKey });
  const activeFilterCount = Number(Boolean(query.trim())) + Number(quickFilter !== "todos") + Number(activeAdvanced);

  function clearFilters() {
    setQuery("");
    setQuickFilter("todos");
    setPlane("todos");
    setReviewStatus("todos");
    setPriority("todos");
    setModelKey("todos");
  }

  return (
    <div className="view-stack">
      <section className="page-heading">
        <div>
          <p>Operaciones académicas RM lumbar</p>
          <h1>Dashboard / Worklist</h1>
        </div>
        <div className="safety-copy">
          <strong>Requiere revisión profesional.</strong>
          <span>La salida IA puede ser inexacta. Verificá todos los resultados.</span>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard label="Revisiones pendientes" value={String(pending)} detail={`${total} estudios cargados desde backend`} tone="amber" />
        <MetricCard label="Estudios revisados" value={String(completed)} detail="aceptados o listos para seguimiento" tone="teal" />
        <MetricCard label="Estado del modelo" value="Online" detail="backend + módulo IA monitoreados" tone="green" />
        <MetricCard label="Casos destacados" value={String(flagged)} detail="requieren inspección cercana" tone="purple" />
      </section>

      <section className="dashboard-grid">
        <article className="panel-card wide-card worklist-panel">
          <div className="section-title">
            <div>
              <h2>Worklist</h2>
              <p className="muted compact-copy">{filteredStudies.length} de {studies.length} estudios visibles{activeFilterCount ? ` · ${activeFilterCount} filtro/s activo/s` : ""}</p>
            </div>
            <button className="ghost-button" disabled={!latestStudy} onClick={() => latestStudy && onOpenReview(latestStudy)} type="button">Abrir revisión</button>
          </div>

          <div className="worklist-filter-shell">
            <div className="worklist-search-row">
              <label className="worklist-search-input">
                <span>Buscar</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Caso, paciente, run/informe, modelo, estado..."
                  type="search"
                />
              </label>
              <button className="ghost-button" onClick={() => setShowAdvanced((value) => !value)} type="button">
                {showAdvanced ? "Ocultar filtros" : "Filtros avanzados"}
              </button>
              <button className="ghost-button" disabled={!activeFilterCount} onClick={clearFilters} type="button">Limpiar</button>
            </div>

            <div className="worklist-filter-tabs" role="tablist" aria-label="Filtros rápidos de worklist">
              {quickFilters.map((filter) => (
                <button className={quickFilter === filter.id ? "active" : ""} key={filter.id} onClick={() => setQuickFilter(filter.id)} type="button">
                  {filter.label}
                </button>
              ))}
            </div>

            {showAdvanced && (
              <div className="advanced-filter-grid">
                <label>
                  <span>Plano</span>
                  <select value={plane} onChange={(event) => setPlane(event.target.value as Plane | AllOption)}>
                    <option value="todos">Todos</option>
                    <option value="sagittal">Sagital</option>
                    <option value="axial">Axial</option>
                  </select>
                </label>
                <label>
                  <span>Estado revisión</span>
                  <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus | AllOption)}>
                    <option value="todos">Todos</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="observado">Observado</option>
                    <option value="aceptado">Aceptado</option>
                    <option value="descartado">Descartado</option>
                  </select>
                </label>
                <label>
                  <span>Prioridad</span>
                  <select value={priority} onChange={(event) => setPriority(event.target.value as Priority | AllOption)}>
                    <option value="todos">Todas</option>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </label>
                <label>
                  <span>Modelo</span>
                  <select value={modelKey} onChange={(event) => setModelKey(event.target.value)}>
                    <option value="todos">Todos</option>
                    {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>

          {filteredStudies.length ? (
            <WorklistTable studies={filteredStudies} onOpenReview={onOpenReview} />
          ) : (
            <div className="panel-hidden-placeholder">No hay estudios que coincidan con los filtros seleccionados.</div>
          )}
        </article>
        <aside className="right-rail">
          <article className="panel-card">
            <div className="section-title"><h2>Vista previa segmentación</h2><span>{latestStudy?.caseId ?? "CASE-DEMO-0142"}</span></div>
            <div className="mini-mri">
              <span className="mini-vertebra v1" />
              <span className="mini-vertebra v2" />
              <span className="mini-vertebra v3" />
              <span className="mini-overlay" />
            </div>
          </article>
          <article className="panel-card">
            <div className="section-title"><h2>Vista 3D columna lumbar</h2><span>L1-S1</span></div>
            <SpineReconstructionPreview />
          </article>
          <article className="panel-card">
            <div className="section-title"><h2>Actividad reciente / auditoría</h2></div>
            <AuditTrail events={auditTrail} />
          </article>
        </aside>
      </section>
      <PrivacyBanner />
    </div>
  );
}
