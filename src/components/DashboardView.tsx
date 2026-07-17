import { useEffect, useMemo, useState } from "react";
import { Brain, CheckCircle2, ClipboardCheck, Flag } from "lucide-react";
import type { AuditEvent, Plane, Priority, ReviewStatus, StudiesSummary, StudyRow } from "../appTypes";
import { aiAssetUrl } from "../multiplanarApi";
import { AuditTrail } from "./AuditTrail";
import { MetricCard } from "./MetricCard";
import { PrivacyBanner } from "./PrivacyBanner";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";
import { WorklistTable } from "./WorklistTable";

type QuickFilter = "todos" | "pendientes" | "observados" | "aprobados" | "prioridad";
type AllOption = "todos";
type PreviewState = "idle" | "loading" | "loaded" | "failed";

interface DashboardViewProps {
  studies: StudyRow[];
  auditTrail: AuditEvent[];
  onOpenReview: (study: StudyRow) => void;
  summary?: StudiesSummary;
  health: string;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  onOpenDiagnostics: () => void;
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

function isAiReady(study: StudyRow) {
  const status = study.modelStatus.toLowerCase();
  return !status.includes("failed") && !status.includes("error") && !status.includes("processing") && !status.includes("queued") && !status.includes("pendiente");
}

export function DashboardView({ studies, auditTrail, onOpenReview, summary, health, aiModuleAvailable, degradedMode, onOpenDiagnostics }: DashboardViewProps) {
  const [query, setQuery] = useState("");
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [plane, setPlane] = useState<Plane | AllOption>("todos");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | AllOption>("todos");
  const [priority, setPriority] = useState<Priority | AllOption>("todos");
  const [modelKey, setModelKey] = useState<string>("todos");

  const total = summary?.total ?? studies.length;
  const pending = summary?.pending ?? studies.filter((study) => study.reviewStatus === "pendiente" || study.reviewStatus === "observado").length;
  const highPriority = studies.filter((study) => study.priority === "alta").length;
  const aiReady = studies.filter(isAiReady).length;
  const flagged = summary?.flagged ?? studies.filter((study) => study.priority === "alta" || study.reviewStatus === "observado").length;
  const modelStatusLabel = degradedMode ? "Degraded" : aiModuleAvailable === false ? "Unavailable" : health === "consultando" ? "Checking" : "Operational";
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
  const latestOverlayUrl = latestStudy?.runId ? aiAssetUrl(latestStudy.runId, latestStudy.plane, "overlay.png") : "";
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

  useEffect(() => {
    if (!latestOverlayUrl) {
      setPreviewState("idle");
      return;
    }
    let cancelled = false;
    setPreviewState("loading");
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setPreviewState("loaded");
    };
    image.onerror = () => {
      if (!cancelled) setPreviewState("failed");
    };
    image.src = latestOverlayUrl;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [latestOverlayUrl]);

  return (
    <div className="view-stack">
      <section className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of studies and system status</p>
        </div>
        <div className="safety-copy">
          <strong>Requiere revisión profesional.</strong>
          <span>La salida IA puede ser inexacta. Verificá todos los resultados.</span>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard icon={<ClipboardCheck aria-hidden size={24} />} label="Pending Reviews" value={String(pending)} detail={`${highPriority} high priority`} tone="blue" />
        <MetricCard icon={<Brain aria-hidden size={24} />} label="AI-Ready Studies" value={String(aiReady)} detail={`${total} studies loaded`} tone="teal" />
        <MetricCard icon={<CheckCircle2 aria-hidden size={24} />} label="Model Status" value={modelStatusLabel} detail="View diagnostics" tone={degradedMode ? "amber" : aiModuleAvailable === false ? "amber" : "purple"} actionLabel="Open diagnostics" onAction={onOpenDiagnostics} />
        <MetricCard icon={<Flag aria-hidden size={24} />} label="Flagged Cases" value={String(flagged)} detail="Require attention" tone="amber" />
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
            <div className="section-title"><h2>Latest Segmentation Preview</h2><span>{latestStudy?.caseId ?? "No case"}</span></div>
            {latestOverlayUrl && previewState === "loaded" ? (
              <>
                <div className="segmentation-preview">
                  <img alt={`Segmentation overlay for ${latestStudy?.caseId}`} src={latestOverlayUrl} />
                  <div className="segmentation-legend" aria-label="Segmentation legend">
                    {["L1", "L2", "L3", "L4", "L5", "S1"].map((level) => <span key={level}><i />{level}</span>)}
                  </div>
                </div>
                <p className="preview-meta">{latestStudy?.caseId} - {latestStudy?.plane} - AI Confidence not reported</p>
              </>
            ) : (
              <div className="panel-hidden-placeholder">{previewState === "loading" ? "Verificando preview real disponible..." : "Sin preview real disponible para este estudio. No se muestra una segmentacion simulada."}</div>
            )}
          </article>
          <article className="panel-card">
            <div className="section-title"><h2>3D Lumbar Spine Preview</h2><span>Atlas generico</span></div>
            <SpineReconstructionPreview />
            <p className="preview-meta">Representacion anatomica de referencia, no paciente-especifica.</p>
          </article>
          <article className="panel-card">
            <div className="section-title"><h2>Recent Activity</h2></div>
            {auditTrail.length ? <AuditTrail events={auditTrail.slice(0, 4)} /> : <div className="panel-hidden-placeholder">Sin actividad reciente disponible.</div>}
          </article>
        </aside>
      </section>
      <PrivacyBanner />
    </div>
  );
}
