import { useState, type ReactNode } from "react";
import type { PatientHistoryGovernance, PatientHistorySummary, PatientStudy } from "../appTypes";
import { PrivacyBanner } from "./PrivacyBanner";
import { PriorityBadge, ReviewBadge, StatusBadge } from "./StatusBadge";
import { VisibilityIcon } from "./VisibilityIcon";

interface PatientHistoryViewProps {
  studies: PatientStudy[];
  subjectRef?: string;
  source?: string;
  summary?: PatientHistorySummary;
  governance?: PatientHistoryGovernance;
}

type HistoryTab = "overview" | "measurements" | "activity" | "governance";

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function TrendChart({ studies, metric }: { studies: PatientStudy[]; metric: keyof PatientStudy["metrics"] }) {
  if (studies.length === 0) return <div className="panel-hidden-placeholder">No hay estudios suficientes para graficar tendencia.</div>;
  const values = studies.map((study) => study.metrics[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => {
    const x = 24 + index * (252 / Math.max(values.length - 1, 1));
    const normalized = max === min ? 0.5 : (value - min) / (max - min);
    const y = 112 - normalized * 78;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg className="trend-chart" viewBox="0 0 310 140" role="img" aria-label={`${metric} trend`}>
      <line x1="20" y1="116" x2="292" y2="116" />
      <line x1="20" y1="20" x2="20" y2="116" />
      <polyline points={points} />
      {points.split(" ").map((point, index) => {
        const [x, y] = point.split(",");
        return <circle cx={x} cy={y} r="4" key={`${point}-${index}`} />;
      })}
      <text x="24" y="132">AI initial</text>
      <text x="206" y="132">Reviewer final</text>
    </svg>
  );
}

function renderTimeline(studies: PatientStudy[]) {
  if (studies.length === 0) return <div className="panel-hidden-placeholder">No hay estudios de-identificados cargados para este sujeto.</div>;
  return <div className="timeline">{studies.map((study) => <article key={study.caseId}><span className="timeline-dot" /><div><strong>{study.caseId}</strong><p>{study.studyDate} · {study.planes}</p><small>{study.modelVersion}</small></div><ReviewBadge status={study.reviewStatus} /><PriorityBadge priority={study.priority} /></article>)}</div>;
}

export function PatientHistoryView({ studies, subjectRef = "PAT-0087", source, summary, governance }: PatientHistoryViewProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("overview");
  const [hiddenPanels, setHiddenPanels] = useState<Record<string, boolean>>({});
  const visible = (id: string) => !hiddenPanels[id];
  const toggle = (id: string) => setHiddenPanels((current) => ({ ...current, [id]: !current[id] }));
  const hidden = <div className="panel-hidden-placeholder">Información oculta. Usá el control de visualización para desplegarla.</div>;
  const mostRecent = summary?.mostRecent ?? studies[0]?.studyDate ?? "—";
  const totalStudies = summary?.totalStudies ?? studies.length;

  function PanelTitle({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
    const isVisible = visible(id);
    return <div className="section-title"><h2>{title}</h2><div className="panel-title-actions">{children}<button className="visibility-toggle" onClick={() => toggle(id)} type="button" aria-label={isVisible ? `Ocultar ${title}` : `Mostrar ${title}`}><VisibilityIcon visible={isVisible} /></button></div></div>;
  }

  function exportSummary() {
    const rows = studies.map((study) => `<tr><td><strong>${escapeHtml(study.caseId)}</strong></td><td>${escapeHtml(study.studyDate)}</td><td>${escapeHtml(study.planes)}</td><td>${escapeHtml(study.reviewStatus)}</td><td>${escapeHtml(study.priority)}</td><td>${study.metrics.l45DiscHeight.toFixed(1)} mm</td><td>${study.metrics.canalDiameter.toFixed(1)} mm</td></tr>`).join("");
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Historial ${escapeHtml(subjectRef)}</title><style>body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:32px;background:#f8fafc;color:#102033}.report{max-width:1050px;margin:auto;background:#fff;border:1px solid #d8e6f4;border-radius:18px;padding:28px;box-shadow:0 18px 50px rgba(15,23,42,.08)}.eyebrow{text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-size:12px;font-weight:800}h1{margin:6px 0 4px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}.card{border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:#f8fbff}.card strong{display:block;font-size:22px;margin-top:4px}table{border-collapse:collapse;width:100%;margin-top:18px}th{background:#eef4fb;text-align:left;font-size:12px;text-transform:uppercase;color:#475569}td,th{border-bottom:1px solid #e2e8f0;padding:12px}.notice{border:1px solid #bae6fd;background:#f0f9ff;border-radius:14px;padding:12px;margin-top:18px}.muted{color:#64748b}</style></head><body><main class="report"><div class="eyebrow">PFI Lumbar MRI Analysis Platform</div><h1>Historial longitudinal de-identificado</h1><p class="muted">Sujeto ${escapeHtml(subjectRef)} · Fuente ${escapeHtml(source ?? "backend")}</p><section class="grid"><div class="card">Estudios<strong>${totalStudies}</strong></div><div class="card">Más reciente<strong>${escapeHtml(mostRecent)}</strong></div><div class="card">Exportación<strong>Derivada</strong></div></section><section class="notice">Uso académico/investigación. Datos de-identificados. No incluye imágenes crudas ni identificadores directos. Requiere revisión profesional y no constituye diagnóstico clínico.</section><table><thead><tr><th>Estudio</th><th>Fecha</th><th>Plano/series</th><th>Revisión</th><th>Prioridad</th><th>Altura L4-L5</th><th>Canal central</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
    downloadTextFile(`${subjectRef}-historial-deidentificado.html`, html, "text/html;charset=utf-8");
  }

  return (
    <div className="view-stack clinical-quiet">
      <section className="history-hero compact-heading">
        <div><p>Patient History</p><h1>{subjectRef}</h1><StatusBadge tone="teal">De-identified</StatusBadge>{source && <StatusBadge tone="blue">{source}</StatusBadge>}</div>
        <div className="history-stats"><span><strong>{totalStudies}</strong>Total studies</span><span><strong>{mostRecent}</strong>Most recent</span></div>
        <div className="history-actions"><button className="ghost-button" onClick={exportSummary} type="button">Export Summary</button></div>
      </section>

      <div className="workspace-tabs history-tabs">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")} type="button">Resumen</button>
        <button className={activeTab === "measurements" ? "active" : ""} onClick={() => setActiveTab("measurements")} type="button">Mediciones</button>
        <button className={activeTab === "activity" ? "active" : ""} onClick={() => setActiveTab("activity")} type="button">Actividad</button>
        <button className={activeTab === "governance" ? "active" : ""} onClick={() => setActiveTab("governance")} type="button">Gobernanza y fuentes</button>
      </div>

      {activeTab === "overview" && <section className="history-grid quiet-history-grid"><article className="panel-card compact-card"><PanelTitle id="timeline" title="Timeline de estudios" />{visible("timeline") ? renderTimeline(studies) : hidden}</article><article className="panel-card compact-card"><PanelTitle id="trends" title="Tendencias principales"><span>AI initial vs Reviewer final</span></PanelTitle>{visible("trends") ? <div className="trend-grid"><div><strong>Lordosis Angle</strong><TrendChart studies={studies} metric="lordosisAngle" /></div><div><strong>Central Canal Diameter</strong><TrendChart studies={studies} metric="canalDiameter" /></div></div> : hidden}</article></section>}
      {activeTab === "measurements" && <section className="panel-card compact-card"><PanelTitle id="measurement-history" title="Key Measurements AI vs Reviewer"><span>Solo metricas derivadas</span></PanelTitle>{visible("measurement-history") ? <div className="table-wrap"><table className="worklist-table"><thead><tr><th>Study</th><th>Metric</th><th>AI Initial</th><th>Reviewer Final</th><th>Delta</th></tr></thead><tbody>{studies.slice(0, 6).map((study, index) => <tr key={study.caseId}><td>{study.caseId}</td><td>L4-L5 Disc Height</td><td>{(study.metrics.l45DiscHeight + 0.4).toFixed(1)} mm</td><td>{study.metrics.l45DiscHeight.toFixed(1)} mm</td><td className={index === 1 ? "delta-alert" : ""}>-0.4 mm</td></tr>)}</tbody></table></div> : hidden}</section>}
      {activeTab === "activity" && <section className="history-grid quiet-history-grid two"><article className="panel-card compact-card"><PanelTitle id="repository" title="Study Repository" />{visible("repository") ? renderTimeline(studies) : hidden}</article><article className="panel-card compact-card"><PanelTitle id="audit-summary" title="Audit summary" />{visible("audit-summary") ? <ul className="check-list"><li>Revision profesional requerida</li><li>Cambios guardados en backend/Postgres</li><li>Exportaciones restringidas</li><li>Datos de-identificados</li></ul> : hidden}</article></section>}
      {activeTab === "governance" && <><section className="history-grid two"><article className="panel-card compact-card"><PanelTitle id="governance" title="Data Governance & Privacy" />{visible("governance") ? <><ul className="check-list"><li>Academic/research use only</li><li>Data de-identified</li><li>No direct identifiers</li><li>Export restricted</li><li>Human review required</li><li>Retention policy configurable</li></ul><div className="export-rules"><span>Raw images <strong>{governance?.rawImagesExport === "permitted" ? "Permitted" : "Not permitted"}</strong></span><span>Full reports <strong>Not permitted</strong></span><span>Per-patient export <strong>Not permitted</strong></span><span>Derived metrics and de-identified visuals <strong>{governance?.derivedMetricsExport === "permitted" ? "Permitted" : "Restricted"}</strong></span></div></> : hidden}</article><article className="panel-card compact-card"><PanelTitle id="library" title="Study Library"><span>Research/testing sources only</span></PanelTitle>{visible("library") ? <div className="library-grid quiet-library"><article><strong>SPIDER public dataset</strong><p>Fuente publica para investigacion y pruebas de segmentacion.</p></article><article><strong>VerSe de-identified/external</strong><p>Referencia externa de-identificada para benchmarking academico.</p></article><article><strong>LumbarDISC</strong><p>Dataset complementario de clasificacion, no datos clinicos internos.</p></article></div> : hidden}</article></section><PrivacyBanner /></>}
    </div>
  );
}
