import { useMemo, useState, type ReactNode } from "react";
import type { PatientHistorySummary, PatientStudy } from "../appTypes";
import { PriorityBadge, ReviewBadge, StatusBadge } from "./StatusBadge";
import { VisibilityIcon } from "./VisibilityIcon";

interface PatientHistoryViewProps {
  studies: PatientStudy[];
  subjectRef?: string;
  source?: string;
  summary?: PatientHistorySummary;
}

type HistoryTab = "overview" | "repository" | "activity";
type MetricKey = "lordosisAngle" | "canalDiameter" | "averageDiscHeight" | "l45DiscHeight";

const longitudinalUnavailable = "Histórico longitudinal no disponible - requiere modelo longitudinal en backend.";

const metricLabels: Record<MetricKey, { label: string; unit: string }> = {
  lordosisAngle: { label: "Ángulo de lordosis lumbar", unit: "deg" },
  canalDiameter: { label: "Diámetro del canal central", unit: "mm" },
  averageDiscHeight: { label: "Altura discal promedio", unit: "mm" },
  l45DiscHeight: { label: "Altura discal L4-L5", unit: "mm" },
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
  const message = detail.includes("Histórico longitudinal no disponible") ? detail : `Histórico longitudinal no disponible - ${detail}`;
  return (
    <div className="panel-hidden-placeholder honest-empty-state">
      <strong>{message}</strong>
      <span>No se muestran tendencias, IA inicial ni deltas derivados si el backend no los entrega como datos almacenados.</span>
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
        <text x="198" y="132">Sin serie IA salvo que est? almacenada</text>
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

export function PatientHistoryView({ studies, subjectRef = "PAT-0087", source, summary }: PatientHistoryViewProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("overview");
  const [hiddenPanels, setHiddenPanels] = useState<Record<string, boolean>>({});
  const visible = (id: string) => !hiddenPanels[id];
  const toggle = (id: string) => setHiddenPanels((current) => ({ ...current, [id]: !current[id] }));
  const hidden = <div className="panel-hidden-placeholder">Información oculta. Usá el control de visualización para desplegarla.</div>;
  const totalStudies = summary?.totalStudies ?? studies.length;
  const firstStudy = summary?.firstStudy ?? studies[studies.length - 1]?.studyDate;
  const mostRecent = summary?.mostRecent ?? studies[0]?.studyDate;
  const rows = useMemo(() => measurementRows(studies), [studies]);
  const hasAiInitialColumn = rows.some((row) => typeof row.ai === "number" && Number.isFinite(row.ai));
  const hasReviewerFinalColumn = rows.some((row) => typeof row.reviewer === "number" && Number.isFinite(row.reviewer));
  const hasLongitudinalModel = Boolean(source && !source.includes("no-longitudinal") && rows.length > 0);

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
          <p>Pacientes / <strong>{subjectRef}</strong></p>
          <h1>{subjectRef}</h1>
          <div className="patient-header-badges"><StatusBadge tone="teal">Deidentificado</StatusBadge>{source && <StatusBadge tone={hasLongitudinalModel ? "green" : "amber"}>{source}</StatusBadge>}</div>
        </div>
        <dl className="patient-header-grid">
          <div><dt>Sexo</dt><dd>Desconocido</dd></div>
          <div><dt>Edad en primer estudio</dt><dd>Desconocida</dd></div>
          <div><dt>Total de estudios</dt><dd>{studyCountLabel(totalStudies)}</dd></div>
          <div><dt>Primer estudio</dt><dd>{formatDate(firstStudy)}</dd></div>
          <div><dt>Más reciente</dt><dd>{formatDate(mostRecent)}</dd></div>
        </dl>
        <div className="history-actions">
          <button className="ghost-button" disabled={studies.length === 0} onClick={exportSummary} title="Exportar resumen derivado de-identificado" type="button">Exportar resumen</button>
          <button className="ghost-button" disabled title="Carga longitudinal pendiente de backend" type="button">Agregar estudio</button>
        </div>
      </section>

      <div className="workspace-tabs history-tabs" role="tablist" aria-label="Tabs de historial de paciente">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")} role="tab" aria-selected={activeTab === "overview"} type="button">Resumen longitudinal</button>
        <button className={activeTab === "repository" ? "active" : ""} onClick={() => setActiveTab("repository")} role="tab" aria-selected={activeTab === "repository"} type="button">Repositorio de estudios</button>
        <button className={activeTab === "activity" ? "active" : ""} onClick={() => setActiveTab("activity")} role="tab" aria-selected={activeTab === "activity"} type="button">Actividad y auditoría</button>
      </div>

      {activeTab === "overview" && (
        <section className="patient-overview-grid">
          <article className="panel-card compact-card">
            <PanelTitle id="timeline" title={`Línea de tiempo de estudios (${totalStudies})`} />
            {visible("timeline") ? renderTimeline(studies) : hidden}
          </article>
          <article className="panel-card compact-card patient-trends-panel">
            <PanelTitle id="trends" title="Tendencias en el tiempo"><span>Solo métricas reales almacenadas</span></PanelTitle>
            {visible("trends") ? (
              <div className="trend-grid">
                <TrendChart studies={studies} metric="lordosisAngle" />
                <TrendChart studies={studies} metric="canalDiameter" />
                <TrendChart studies={studies} metric="averageDiscHeight" />
              </div>
            ) : hidden}
          </article>
          <article className="panel-card compact-card">
            <PanelTitle id="measurement-history" title="Mediciones clave"><span>Solo valores backend almacenados</span></PanelTitle>
            {visible("measurement-history") ? rows.length ? (
              <div className="table-wrap">
                <table className="worklist-table longitudinal-measurements-table">
                  <thead><tr><th>Estudio</th><th>Métrica</th><th>Valor almacenado</th>{hasAiInitialColumn && <th>IA inicial</th>}{hasReviewerFinalColumn && <th>Revisor final</th>}{hasAiInitialColumn && hasReviewerFinalColumn && <th>Delta</th>}</tr></thead>
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
            ) : <EmptyLongitudinalState detail="Mediciones clave longitudinales no disponibles - requiere histórico de mediciones en backend." /> : hidden}
          </article>
        </section>
      )}

      {activeTab === "repository" && (
        <section className="history-grid quiet-history-grid">
          <article className="panel-card compact-card"><PanelTitle id="repository" title="Repositorio de estudios" />{visible("repository") ? renderTimeline(studies) : hidden}</article>
        </section>
      )}

      {activeTab === "activity" && (
        <section className="history-grid quiet-history-grid">
          <article className="panel-card compact-card"><PanelTitle id="activity-empty" title="Actividad" />{visible("activity-empty") ? <EmptyLongitudinalState detail="Auditoría longitudinal por paciente no disponible - requiere agregación backend." /> : hidden}</article>
        </section>
      )}
    </div>
  );
}
