import { useState } from "react";

type ReviewStatus = "pendiente" | "aceptado" | "observado" | "descartado";
type Priority = "alta" | "media" | "baja";
type PatientStudy = { caseId: string; studyDate: string; planes: string; modelVersion: string; reviewStatus: ReviewStatus; priority: Priority; metrics: { lordosisAngle: number; canalDiameter: number; averageDiscHeight: number; l45DiscHeight: number } };

import { PrivacyBanner } from "./PrivacyBanner";
import { PriorityBadge, ReviewBadge, StatusBadge } from "./StatusBadge";

interface PatientHistoryViewProps { studies: PatientStudy[]; }

type HistoryTab = "overview" | "measurements" | "activity" | "governance";

function TrendChart({ studies, metric }: { studies: PatientStudy[]; metric: keyof PatientStudy["metrics"] }) {
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
  return <div className="timeline">{studies.map((study) => <article key={study.caseId}><span className="timeline-dot" /><div><strong>{study.caseId}</strong><p>{study.studyDate} · {study.planes}</p><small>{study.modelVersion}</small></div><ReviewBadge status={study.reviewStatus} /><PriorityBadge priority={study.priority} /></article>)}</div>;
}

export function PatientHistoryView({ studies }: PatientHistoryViewProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("overview");
  const [hiddenPanels, setHiddenPanels] = useState<Record<string, boolean>>({});
  const visible = (id: string) => !hiddenPanels[id];
  const toggle = (id: string) => setHiddenPanels((current) => ({ ...current, [id]: !current[id] }));
  const hidden = <div className="panel-hidden-placeholder">Información oculta. Usá el ojo para desplegarla.</div>;

  function PanelTitle({ id, title, children }: { id: string; title: string; children?: any }) {
    const isVisible = visible(id);
    return <div className="section-title"><h2>{title}</h2><div className="panel-title-actions">{children}<button className="visibility-toggle" onClick={() => toggle(id)} type="button" aria-label={isVisible ? `Ocultar ${title}` : `Mostrar ${title}`}>{isVisible ? "👁" : "🙈"}</button></div></div>;
  }

  return (
    <div className="view-stack clinical-quiet">
      <section className="history-hero compact-heading">
        <div><p>Patient History</p><h1>PAT-0087</h1><StatusBadge tone="teal">De-identified</StatusBadge></div>
        <div className="history-stats"><span><strong>{studies.length}</strong>Total studies</span><span><strong>{studies[0]?.studyDate}</strong>Most recent</span></div>
        <div className="history-actions"><button className="ghost-button" type="button">Export Summary</button></div>
      </section>

      <div className="workspace-tabs history-tabs">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")} type="button">Resumen</button>
        <button className={activeTab === "measurements" ? "active" : ""} onClick={() => setActiveTab("measurements")} type="button">Mediciones</button>
        <button className={activeTab === "activity" ? "active" : ""} onClick={() => setActiveTab("activity")} type="button">Actividad</button>
        <button className={activeTab === "governance" ? "active" : ""} onClick={() => setActiveTab("governance")} type="button">Gobernanza y fuentes</button>
      </div>

      {activeTab === "overview" && (
        <section className="history-grid quiet-history-grid">
          <article className="panel-card compact-card"><PanelTitle id="timeline" title="Timeline de estudios" />{visible("timeline") ? renderTimeline(studies) : hidden}</article>
          <article className="panel-card compact-card"><PanelTitle id="trends" title="Tendencias principales"><span>AI initial vs Reviewer final</span></PanelTitle>{visible("trends") ? <div className="trend-grid"><div><strong>Lordosis Angle</strong><TrendChart studies={studies} metric="lordosisAngle" /></div><div><strong>Central Canal Diameter</strong><TrendChart studies={studies} metric="canalDiameter" /></div></div> : hidden}</article>
        </section>
      )}

      {activeTab === "measurements" && (
        <section className="panel-card compact-card"><PanelTitle id="measurement-history" title="Key Measurements AI vs Reviewer"><span>Solo metricas derivadas</span></PanelTitle>{visible("measurement-history") ? <div className="table-wrap"><table className="worklist-table"><thead><tr><th>Study</th><th>Metric</th><th>AI Initial</th><th>Reviewer Final</th><th>Delta</th></tr></thead><tbody>{studies.slice(0, 4).map((study, index) => <tr key={study.caseId}><td>{study.caseId}</td><td>L4-L5 Disc Height</td><td>{(study.metrics.l45DiscHeight + 0.4).toFixed(1)} mm</td><td>{study.metrics.l45DiscHeight.toFixed(1)} mm</td><td className={index === 1 ? "delta-alert" : ""}>-0.4 mm</td></tr>)}</tbody></table></div> : hidden}</section>
      )}

      {activeTab === "activity" && (
        <section className="history-grid quiet-history-grid two">
          <article className="panel-card compact-card"><PanelTitle id="repository" title="Study Repository" />{visible("repository") ? renderTimeline(studies) : hidden}</article>
          <article className="panel-card compact-card"><PanelTitle id="audit-summary" title="Audit summary" />{visible("audit-summary") ? <ul className="check-list"><li>Revision profesional requerida</li><li>Cambios guardados en backend/Postgres</li><li>Exportaciones restringidas</li><li>Datos de-identificados</li></ul> : hidden}</article>
        </section>
      )}

      {activeTab === "governance" && (
        <>
          <section className="history-grid two">
            <article className="panel-card compact-card"><PanelTitle id="governance" title="Data Governance & Privacy" />{visible("governance") ? <><ul className="check-list"><li>Academic/research use only</li><li>Data de-identified</li><li>No direct identifiers</li><li>Export restricted</li><li>Human review required</li><li>Retention policy configurable</li></ul><div className="export-rules"><span>Raw images <strong>Not permitted</strong></span><span>Full reports <strong>Not permitted</strong></span><span>Per-patient export <strong>Not permitted</strong></span><span>Derived metrics and de-identified visuals <strong>Permitted</strong></span></div></> : hidden}</article>
            <article className="panel-card compact-card"><PanelTitle id="library" title="Study Library"><span>Research/testing sources only</span></PanelTitle>{visible("library") ? <div className="library-grid quiet-library"><article><strong>SPIDER public dataset</strong><p>Fuente publica para investigacion y pruebas de segmentacion.</p></article><article><strong>VerSe de-identified/external</strong><p>Referencia externa de-identificada para benchmarking academico.</p></article><article><strong>LumbarDISC</strong><p>Dataset complementario de clasificacion, no datos clinicos internos.</p></article></div> : hidden}</article>
          </section>
          <PrivacyBanner />
        </>
      )}
    </div>
  );
}
