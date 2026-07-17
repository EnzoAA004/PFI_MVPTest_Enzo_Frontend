import { useMemo, useState, type ReactNode } from "react";
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

type HistoryTab = "overview" | "repository" | "activity" | "governance";
type MetricKey = "lordosisAngle" | "canalDiameter" | "averageDiscHeight" | "l45DiscHeight";

const longitudinalUnavailable = "Historico longitudinal no disponible - requiere modelo longitudinal en backend.";

const metricLabels: Record<MetricKey, { label: string; unit: string }> = {
  lordosisAngle: { label: "Lumbar Lordosis Angle", unit: "deg" },
  canalDiameter: { label: "Central Canal Diameter", unit: "mm" },
  averageDiscHeight: { label: "Average Disc Height", unit: "mm" },
  l45DiscHeight: { label: "L4-L5 Disc Height", unit: "mm" },
};

function formatDate(value?: string) {
  return value && value.trim() ? value : "sin datos";
}

function studyCountLabel(count: number) {
  return count === 1 ? "1 estudio" : `${count} estudios`;
}

function metricValue(study: PatientStudy, key: MetricKey) {
  const value = study.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function realMetricPoints(studies: PatientStudy[], key: MetricKey) {
  return studies
    .map((study) => ({ study, value: metricValue(study, key) }))
    .filter((point): point is { study: PatientStudy; value: number } => point.value !== undefined);
}

function hasAiReviewerPair(study: PatientStudy, key: MetricKey) {
  const ai = study.metrics?.aiInitial?.[key];
  const reviewer = study.metrics?.reviewerFinal?.[key];
  return typeof ai === "number" && Number.isFinite(ai) && typeof reviewer === "number" && Number.isFinite(reviewer);
}

function EmptyLongitudinalState({ detail = longitudinalUnavailable }: { detail?: string }) {
  const message = detail.includes("Historico longitudinal no disponible") ? detail : `Historico longitudinal no disponible - ${detail}`;
  return (
    <div className="panel-hidden-placeholder honest-empty-state">
      <strong>{message}</strong>
      <span>No se muestran tendencias, AI Initial ni deltas derivados si el backend no los entrega como datos almacenados.</span>
    </div>
  );
}

function TrendChart({ studies, metric }: { studies: PatientStudy[]; metric: MetricKey }) {
  const points = realMetricPoints(studies, metric);
  if (points.length < 2) return <EmptyLongitudinalState detail={`${metricLabels[metric].label}: se requieren al menos 2 puntos reales.`} />;

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const plotted = points.map((point, index) => {
    const x = 24 + index * (252 / Math.max(points.length - 1, 1));
    const normalized = max === min ? 0.5 : (point.value - min) / (max - min);
    const y = 112 - normalized * 78;
    return { x, y, point };
  });
  const polyline = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  const latest = plotted[plotted.length - 1]?.point;

  return (
    <figure className="trend-card">
      <figcaption>
        <strong>{metricLabels[metric].label}</strong>
        {latest && <span>Latest {latest.value.toFixed(1)} {metricLabels[metric].unit}</span>}
      </figcaption>
      <svg className="trend-chart" viewBox="0 0 310 140" role="img" aria-label={`${metricLabels[metric].label} real stored trend`}>
        <line x1="20" y1="116" x2="292" y2="116" />
        <line x1="20" y1="20" x2="20" y2="116" />
        <polyline points={polyline} />
        {plotted.map(({ x, y, point }) => <circle cx={x} cy={y} r="4" key={`${point.study.caseId}-${metric}`} />)}
        <text x="24" y="132">Stored values</text>
        <text x="198" y="132">No AI series unless stored</text>
      </svg>
    </figure>
  );
}

function renderTimeline(studies: PatientStudy[]) {
  if (studies.length === 0) return <EmptyLongitudinalState detail="No hay estudios reales cargados para este sujeto." />;
  return (
    <div className="timeline patient-timeline">
      {studies.map((study) => (
        <article key={study.caseId}>
          <span className="timeline-dot" />
          <div>
            <strong>{study.caseId}</strong>
            <p>{formatDate(study.studyDate)} · {study.planes || "sin plano"}</p>
            <small>{study.modelVersion || "modelo sin datos"}</small>
          </div>
          <ReviewBadge status={study.reviewStatus} />
          <PriorityBadge priority={study.priority} />
        </article>
      ))}
    </div>
  );
}

function measurementRows(studies: PatientStudy[]) {
  return studies.flatMap((study) => (Object.keys(metricLabels) as MetricKey[]).flatMap((metric) => {
    const stored = metricValue(study, metric);
    const ai = study.metrics?.aiInitial?.[metric];
    const reviewer = study.metrics?.reviewerFinal?.[metric];
    if (stored === undefined && !hasAiReviewerPair(study, metric)) return [];
    return [{ study, metric, stored, ai, reviewer }];
  }));
}

export function PatientHistoryView({ studies, subjectRef = "PAT-0087", source, summary, governance }: PatientHistoryViewProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("overview");
  const [hiddenPanels, setHiddenPanels] = useState<Record<string, boolean>>({});
  const visible = (id: string) => !hiddenPanels[id];
  const toggle = (id: string) => setHiddenPanels((current) => ({ ...current, [id]: !current[id] }));
  const hidden = <div className="panel-hidden-placeholder">Informacion oculta. Usa el control de visualizacion para desplegarla.</div>;
  const totalStudies = summary?.totalStudies ?? studies.length;
  const firstStudy = summary?.firstStudy ?? studies[studies.length - 1]?.studyDate;
  const mostRecent = summary?.mostRecent ?? studies[0]?.studyDate;
  const rows = useMemo(() => measurementRows(studies), [studies]);
  const hasAiInitialColumn = rows.some((row) => typeof row.ai === "number" && Number.isFinite(row.ai));
  const hasReviewerFinalColumn = rows.some((row) => typeof row.reviewer === "number" && Number.isFinite(row.reviewer));
  const hasLongitudinalModel = Boolean(source && !source.includes("no-longitudinal") && rows.length > 0);
  const derivedExportPermitted = governance?.derivedMetricsExport === "permitted";

  function PanelTitle({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
    const isVisible = visible(id);
    return <div className="section-title"><h2>{title}</h2><div className="panel-title-actions">{children}<button className={`visibility-toggle ${isVisible ? "is-visible" : "is-hidden"}`} onClick={() => toggle(id)} type="button" aria-label={isVisible ? `Ocultar ${title}` : `Mostrar ${title}`} title={isVisible ? `Ocultar ${title}` : `Mostrar ${title}`}><VisibilityIcon visible={isVisible} /></button></div></div>;
  }

  function exportSummary() {
    const payload = {
      subjectRef,
      deidentified: true,
      source: source ?? "unknown",
      totalStudies,
      firstStudy: firstStudy ?? null,
      mostRecent: mostRecent ?? null,
      exportScope: "derived-deidentified-summary",
      studies: studies.map((study) => ({
        caseId: study.caseId,
        studyDate: study.studyDate,
        planes: study.planes,
        modelVersion: study.modelVersion,
        reviewStatus: study.reviewStatus,
        priority: study.priority,
        metrics: study.metrics ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${subjectRef}-derived-summary.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="view-stack clinical-quiet patient-longitudinal-view">
      <section className="history-hero compact-heading patient-history-header">
        <div className="patient-avatar" aria-hidden="true">{subjectRef.slice(0, 1)}</div>
        <div>
          <p>Patients / <strong>{subjectRef}</strong></p>
          <h1>{subjectRef}</h1>
          <div className="patient-header-badges"><StatusBadge tone="teal">De-identified</StatusBadge>{source && <StatusBadge tone={hasLongitudinalModel ? "green" : "amber"}>{source}</StatusBadge>}</div>
        </div>
        <dl className="patient-header-grid">
          <div><dt>Sex</dt><dd>Unknown</dd></div>
          <div><dt>Age at First Study</dt><dd>Unknown</dd></div>
          <div><dt>Total Studies</dt><dd>{studyCountLabel(totalStudies)}</dd></div>
          <div><dt>First Study</dt><dd>{formatDate(firstStudy)}</dd></div>
          <div><dt>Most Recent</dt><dd>{formatDate(mostRecent)}</dd></div>
        </dl>
        <div className="history-actions">
          <button className="ghost-button" disabled={!derivedExportPermitted || studies.length === 0} onClick={exportSummary} title={derivedExportPermitted ? "Exportar resumen derivado de-identificado" : "Export restringido por governance"} type="button">Export Summary</button>
          <button className="ghost-button" disabled title="Carga longitudinal pendiente de backend" type="button">Add Study</button>
        </div>
      </section>

      <div className="workspace-tabs history-tabs" role="tablist" aria-label="Patient history tabs">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")} role="tab" aria-selected={activeTab === "overview"} type="button">Longitudinal Overview</button>
        <button className={activeTab === "repository" ? "active" : ""} onClick={() => setActiveTab("repository")} role="tab" aria-selected={activeTab === "repository"} type="button">Study Repository</button>
        <button className={activeTab === "activity" ? "active" : ""} onClick={() => setActiveTab("activity")} role="tab" aria-selected={activeTab === "activity"} type="button">Activity & Audit</button>
        <button className={activeTab === "governance" ? "active" : ""} onClick={() => setActiveTab("governance")} role="tab" aria-selected={activeTab === "governance"} type="button">Data Governance</button>
      </div>

      {activeTab === "overview" && (
        <section className="patient-overview-grid">
          <article className="panel-card compact-card">
            <PanelTitle id="timeline" title={`Study Timeline (${totalStudies})`} />
            {visible("timeline") ? renderTimeline(studies) : hidden}
          </article>
          <article className="panel-card compact-card patient-trends-panel">
            <PanelTitle id="trends" title="Trends Over Time"><span>Stored real metrics only</span></PanelTitle>
            {visible("trends") ? (
              <div className="trend-grid">
                <TrendChart studies={studies} metric="lordosisAngle" />
                <TrendChart studies={studies} metric="canalDiameter" />
                <TrendChart studies={studies} metric="averageDiscHeight" />
              </div>
            ) : hidden}
          </article>
          <article className="panel-card compact-card">
            <PanelTitle id="measurement-history" title="Key Measurements"><span>Stored backend values only</span></PanelTitle>
            {visible("measurement-history") ? rows.length ? (
              <div className="table-wrap">
                <table className="worklist-table longitudinal-measurements-table">
                  <thead><tr><th>Study</th><th>Metric</th><th>Stored Value</th>{hasAiInitialColumn && <th>AI Initial</th>}{hasReviewerFinalColumn && <th>Reviewer Final</th>}{hasAiInitialColumn && hasReviewerFinalColumn && <th>Delta</th>}</tr></thead>
                  <tbody>
                    {rows.map(({ study, metric, stored, ai, reviewer }) => {
                      const pair = hasAiReviewerPair(study, metric);
                      const delta = pair && ai !== undefined && reviewer !== undefined ? reviewer - ai : undefined;
                      return (
                        <tr key={`${study.caseId}-${metric}`}>
                          <td><strong>{study.caseId}</strong><small>{formatDate(study.studyDate)}</small></td>
                          <td>{metricLabels[metric].label}</td>
                          <td className="tabular-value">{stored !== undefined ? `${stored.toFixed(1)} ${metricLabels[metric].unit}` : "—"}</td>
                          {hasAiInitialColumn && <td className="tabular-value">{ai !== undefined ? `${ai.toFixed(1)} ${metricLabels[metric].unit}` : "no almacenado"}</td>}
                          {hasReviewerFinalColumn && <td className="tabular-value">{reviewer !== undefined ? `${reviewer.toFixed(1)} ${metricLabels[metric].unit}` : "no almacenado"}</td>}
                          {hasAiInitialColumn && hasReviewerFinalColumn && <td className="tabular-value">{delta !== undefined ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${metricLabels[metric].unit}` : "—"}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <EmptyLongitudinalState detail="Key Measurements longitudinales no disponibles - requiere historico de mediciones en backend." /> : hidden}
          </article>
          <aside className="patient-side-stack">
            <GovernancePanel governance={governance} visible={visible("governance-side")} hidden={hidden} title={<PanelTitle id="governance-side" title="Data Governance & Privacy" />} />
            <ExportRulesPanel governance={governance} visible={visible("export-side")} hidden={hidden} title={<PanelTitle id="export-side" title="Export & Sharing Restrictions" />} />
          </aside>
        </section>
      )}

      {activeTab === "repository" && (
        <section className="history-grid quiet-history-grid two">
          <article className="panel-card compact-card"><PanelTitle id="repository" title="Study Repository" />{visible("repository") ? renderTimeline(studies) : hidden}</article>
          <StudyLibrary title={<PanelTitle id="library-repository" title="Study Library"><span>Research/testing sources only</span></PanelTitle>} visible={visible("library-repository")} hidden={hidden} />
        </section>
      )}

      {activeTab === "activity" && (
        <section className="history-grid quiet-history-grid two">
          <article className="panel-card compact-card"><PanelTitle id="audit-summary" title="Data Provenance & Audit" />{visible("audit-summary") ? <ul className="check-list"><li>Human review required for every AI output.</li><li>Longitudinal model not available in current backend response.</li><li>No fabricated AI Initial or Reviewer Final series shown.</li><li>Data remains de-identified as PAT reference only.</li></ul> : hidden}</article>
          <article className="panel-card compact-card"><PanelTitle id="activity-empty" title="Activity Feed" />{visible("activity-empty") ? <EmptyLongitudinalState detail="Audit longitudinal por paciente no disponible - requiere agregacion backend." /> : hidden}</article>
        </section>
      )}

      {activeTab === "governance" && (
        <>
          <section className="history-grid two">
            <GovernancePanel governance={governance} visible={visible("governance")} hidden={hidden} title={<PanelTitle id="governance" title="Data Governance & Privacy" />} />
            <ExportRulesPanel governance={governance} visible={visible("export")} hidden={hidden} title={<PanelTitle id="export" title="Export & Sharing Restrictions" />} />
            <StudyLibrary title={<PanelTitle id="library" title="Study Library"><span>Research/testing sources only</span></PanelTitle>} visible={visible("library")} hidden={hidden} />
          </section>
          <PrivacyBanner />
        </>
      )}
    </div>
  );
}

function GovernancePanel({ governance, visible, hidden, title }: { governance?: PatientHistoryGovernance; visible: boolean; hidden: ReactNode; title: ReactNode }) {
  return <article className="panel-card compact-card">{title}{visible ? <ul className="check-list"><li>Academic/research use only</li><li>Data de-identified</li><li>No direct identifiers</li><li>Human review required: {governance?.humanReviewRequired === false ? "No informado" : "Yes"}</li><li>Not for clinical diagnosis: {governance?.notClinicalDiagnosis === false ? "No informado" : "Yes"}</li><li>Longitudinal backend model required for trends.</li></ul> : hidden}</article>;
}

function ExportRulesPanel({ governance, visible, hidden, title }: { governance?: PatientHistoryGovernance; visible: boolean; hidden: ReactNode; title: ReactNode }) {
  return <article className="panel-card compact-card">{title}{visible ? <div className="export-rules"><span>Raw images <strong>Not permitted</strong></span><span>Full reports <strong>Not permitted</strong></span><span>Per-patient export <strong>Not permitted</strong></span><span>Derived metrics & de-identified visuals <strong>{governance?.derivedMetricsExport === "permitted" ? "Permitted" : "Restricted"}</strong></span></div> : hidden}</article>;
}

function StudyLibrary({ title, visible, hidden }: { title: ReactNode; visible: boolean; hidden: ReactNode }) {
  return <article className="panel-card compact-card study-library-card">{title}{visible ? <div className="library-grid quiet-library"><article><strong>Public Lumbar MRI Dataset</strong><p>Open-access multi-center lumbar MRI dataset for research/testing.</p></article><article><strong>VerSe (De-identified)</strong><p>External de-identified reference for academic benchmarking.</p></article><article><strong>SpineXchange (De-identified)</strong><p>Research/testing source only; not internal patient data.</p></article></div> : hidden}</article>;
}
