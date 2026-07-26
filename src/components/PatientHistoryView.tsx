import { useMemo, useState, type ReactNode } from "react";
import type { HistoryTarget, Measurement, PatientHistorySummary, PatientStudy, Plane } from "../appTypes";
import { displayMeasurementLabel, displayModality, displayReviewStatus, displayUnit } from "../clinicalDisplay";
import { displayStudyDate, displaySubjectRef } from "../studyDisplay";
import { PriorityBadge, ReviewBadge, StatusBadge } from "./StatusBadge";
import { VisibilityIcon } from "./VisibilityIcon";

interface PatientHistoryViewProps {
  studies: PatientStudy[];
  target?: HistoryTarget | null;
  subjectRef?: string | null;
  source?: string;
  summary?: PatientHistorySummary;
  error?: string;
  onOpenStudyReview?: (caseId: string) => void;
}

type HistoryTab = "overview" | "repository" | "activity";
type MeasurementKey = string;

const longitudinalUnavailable = "Historial longitudinal no disponible: requiere estudios persistidos con referencia de-identificada.";

function formatDate(value?: string | null) {
  return value && value.trim() ? displayStudyDate(value) : "Fecha no informada";
}

function studyCountLabel(count: number) {
  return count === 1 ? "1 estudio" : `${count} estudios`;
}

function planeLabel(value?: string | null) {
  return value && value.trim() ? value : "Planos no informados";
}

function EmptyLongitudinalState({ detail = longitudinalUnavailable }: { detail?: string }) {
  return (
    <div className="panel-hidden-placeholder honest-empty-state">
      <strong>{detail}</strong>
      <span>No se muestran tendencias, deltas ni valores derivados si el backend no los entrega como datos almacenados.</span>
    </div>
  );
}

function measurementsForStudy(study: PatientStudy): Measurement[] {
  const byPlane = study.measurementsByPlane ?? {};
  return (["sagittal", "axial"] as Plane[]).flatMap((plane) => byPlane[plane] ?? []);
}

function measurementKey(measurement: Measurement) {
  return measurement.id || `${measurement.plane ?? "plane"}:${measurement.label}`;
}

function measurementLabel(measurement?: Measurement) {
  if (!measurement) return "Medición técnica";
  return displayMeasurementLabel(measurement.label);
}

function measurementCell(measurement?: Measurement) {
  if (!measurement) return <span className="muted">No disponible</span>;
  const unit = displayUnit(measurement.unit);
  const aiValue = measurement.aiValue ?? measurement.value;
  const reviewerValue = measurement.reviewerValue;
  const effective = reviewerValue ?? measurement.value;
  return (
    <div className="longitudinal-measurement-cell">
      <strong>{String(effective)} {unit}</strong>
      <small>IA: {String(aiValue)} {unit}</small>
      {reviewerValue !== undefined && reviewerValue !== null && <small>Revisor: {String(reviewerValue)} {unit}</small>}
    </div>
  );
}

function buildComparativeRows(studies: PatientStudy[]) {
  const rows = new Map<MeasurementKey, { label: string; unit: string; values: Map<string, Measurement> }>();
  studies.forEach((study) => {
    measurementsForStudy(study).forEach((measurement) => {
      const key = measurementKey(measurement);
      const current = rows.get(key) ?? { label: measurementLabel(measurement), unit: displayUnit(measurement.unit), values: new Map<string, Measurement>() };
      current.values.set(study.caseId, measurement);
      rows.set(key, current);
    });
  });
  return Array.from(rows.entries()).map(([key, value]) => ({ key, ...value }));
}

function renderTimeline(studies: PatientStudy[], onOpenStudyReview?: (caseId: string) => void) {
  if (studies.length === 0) return <EmptyLongitudinalState detail="No hay estudios persistidos para esta referencia." />;
  return (
    <div className="timeline patient-timeline">
      {studies.map((study) => (
        <article key={study.caseId}>
          <span className="timeline-dot" />
          <div>
            <strong>{study.caseId}</strong>
            <p>{formatDate(study.studyDate)} · {planeLabel(study.planes)}</p>
            <small>{displayModality(study.modality)} · {study.description || "Descripción no informada"}</small>
            <small>Modelo: {study.modelKey || study.modelVersion || "no informado"} · Revisor: {study.reviewer || "no informado"}</small>
            {study.reviewedAt && <small>Revisado: {formatDate(study.reviewedAt)}</small>}
          </div>
          <ReviewBadge status={study.reviewStatus} />
          <PriorityBadge priority={study.priority} />
          {onOpenStudyReview && <button className="ghost-button" onClick={() => onOpenStudyReview(study.caseId)} type="button">Abrir revisión</button>}
        </article>
      ))}
    </div>
  );
}

function measurementCount(studies: PatientStudy[]) {
  return studies.reduce((total, study) => total + measurementsForStudy(study).length, 0);
}

export function PatientHistoryView({ studies, target, subjectRef, source, summary, error, onOpenStudyReview }: PatientHistoryViewProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("overview");
  const [hiddenPanels, setHiddenPanels] = useState<Record<string, boolean>>({});
  const visible = (id: string) => !hiddenPanels[id];
  const toggle = (id: string) => setHiddenPanels((current) => ({ ...current, [id]: !current[id] }));
  const hidden = <div className="panel-hidden-placeholder">Información oculta. Usá el control de visualización para desplegarla.</div>;
  const studyTraceabilityMode = target?.kind === "study";
  const displayReference = studyTraceabilityMode ? target.caseId : subjectRef ?? (target?.kind === "subject" ? target.subjectRef : null);
  const totalStudies = summary?.totalStudies ?? studies.length;
  const firstStudy = summary?.firstStudy ?? studies[studies.length - 1]?.studyDate;
  const mostRecent = summary?.mostRecent ?? studies[0]?.studyDate;
  const comparativeRows = useMemo(() => buildComparativeRows(studies), [studies]);
  const hasMeasurements = comparativeRows.length > 0;

  if (!displayReference) {
    return (
      <section className="panel-card clinical-empty-state">
        <h2>Sin paciente seleccionado</h2>
        <p>Seleccioná una referencia de-identificada o un estudio real para consultar la información disponible.</p>
      </section>
    );
  }

  function PanelTitle({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
    const isVisible = visible(id);
    return <div className="section-title"><h2>{title}</h2><div className="panel-title-actions">{children}<button className={`visibility-toggle ${isVisible ? "is-visible" : "is-hidden"}`} onClick={() => toggle(id)} type="button" aria-label={isVisible ? `Ocultar ${title}` : `Mostrar ${title}`} title={isVisible ? `Ocultar ${title}` : `Mostrar ${title}`}><VisibilityIcon visible={isVisible} /></button></div></div>;
  }

  function exportSummary() {
    const payload = {
      target,
      deidentified: true,
      source: source ?? "unknown",
      totalStudies,
      firstStudy: firstStudy ?? null,
      mostRecent: mostRecent ?? null,
      exportScope: studyTraceabilityMode ? "single-study-traceability" : "subject-deidentified-history",
      studies: studies.map((study) => ({
        caseId: study.caseId,
        subjectRef: study.subjectRef ?? null,
        studyDate: study.studyDate,
        modality: study.modality ?? null,
        description: study.description ?? null,
        planes: study.planes,
        modelKey: study.modelKey ?? null,
        latestRunId: study.latestRunId ?? null,
        reviewStatus: study.reviewStatus,
        priority: study.priority,
        measurementsByPlane: study.measurementsByPlane ?? null,
        corrections: study.corrections ?? [],
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${studyTraceabilityMode ? displayReference : displaySubjectRef(displayReference)}-resumen-deidentificado.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="view-stack clinical-quiet patient-longitudinal-view">
      <section className="history-hero compact-heading patient-history-header">
        <div className="patient-avatar" aria-hidden="true">{displayReference.slice(0, 1)}</div>
        <div>
          <p>{studyTraceabilityMode ? "Trazabilidad del estudio" : "Historial longitudinal de-identificado"} / <strong>{displayReference}</strong></p>
          <h1>{studyTraceabilityMode ? "Trazabilidad del estudio" : displayReference}</h1>
          <div className="patient-header-badges">
            <StatusBadge tone={studyTraceabilityMode ? "amber" : "teal"}>{studyTraceabilityMode ? "Sin referencia estable" : "De-identificado"}</StatusBadge>
            {source && <StatusBadge tone={source === "postgres-domain" ? "green" : "amber"}>{source}</StatusBadge>}
          </div>
          {studyTraceabilityMode ? (
            <p className="viewer-limit-note">No existe una referencia estable de paciente. Esta vista corresponde a un único estudio y no representa un historial longitudinal.</p>
          ) : (
            <p className="viewer-limit-note">Los estudios están vinculados mediante una referencia académica de-identificada. No contiene identidad clínica directa.</p>
          )}
        </div>
        <dl className="patient-header-grid">
          <div><dt>Total de estudios</dt><dd>{studyCountLabel(totalStudies)}</dd></div>
          <div><dt>Pendientes</dt><dd>{summary?.pending ?? studies.filter((study) => study.reviewStatus === "pendiente").length}</dd></div>
          <div><dt>Finalizados</dt><dd>{summary?.completed ?? studies.filter((study) => study.reviewStatus === "aceptado").length}</dd></div>
          <div><dt>Observados</dt><dd>{summary?.observed ?? studies.filter((study) => study.reviewStatus === "observado").length}</dd></div>
          <div><dt>Con fecha informada</dt><dd>{summary?.withStudyDate ?? studies.filter((study) => Boolean(study.studyDate)).length}</dd></div>
          <div><dt>Primer estudio</dt><dd>{formatDate(firstStudy)}</dd></div>
          <div><dt>Más reciente</dt><dd>{formatDate(mostRecent)}</dd></div>
          <div><dt>Mediciones reales</dt><dd>{measurementCount(studies)}</dd></div>
        </dl>
        <div className="history-actions">
          <button className="ghost-button" disabled={studies.length === 0} onClick={exportSummary} title="Exportar resumen de-identificado" type="button">Exportar resumen</button>
          <button className="ghost-button" disabled title="Carga longitudinal pendiente de backend" type="button">Agregar estudio</button>
        </div>
      </section>

      {error && <div className="toast error" role="alert">No se pudo consultar el historial. {error}</div>}
      <div className="toast info">Uso académico con datos de-identificados. Requiere revisión humana y no constituye diagnóstico clínico.</div>

      <div className="workspace-tabs history-tabs" role="tablist" aria-label="Tabs de historial de paciente">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")} role="tab" aria-selected={activeTab === "overview"} type="button">{studyTraceabilityMode ? "Resumen del estudio" : "Resumen longitudinal"}</button>
        <button className={activeTab === "repository" ? "active" : ""} onClick={() => setActiveTab("repository")} role="tab" aria-selected={activeTab === "repository"} type="button">Repositorio de estudios</button>
        <button className={activeTab === "activity" ? "active" : ""} onClick={() => setActiveTab("activity")} role="tab" aria-selected={activeTab === "activity"} type="button">Actividad y auditoría</button>
      </div>

      {activeTab === "overview" && (
        <section className="patient-overview-grid">
          <article className="panel-card compact-card">
            <PanelTitle id="timeline" title={`Línea de tiempo de estudios (${totalStudies})`} />
            {visible("timeline") ? renderTimeline(studies, onOpenStudyReview) : hidden}
          </article>
          <article className="panel-card compact-card patient-trends-panel">
            <PanelTitle id="trends" title="Tendencias en el tiempo"><span>Sin modelo longitudinal backend</span></PanelTitle>
            {visible("trends") ? <EmptyLongitudinalState detail="No se calculan tendencias clínicas ni progresión longitudinal desde el frontend." /> : hidden}
          </article>
          <article className="panel-card compact-card">
            <PanelTitle id="measurement-history" title="Mediciones longitudinales reales"><span>Solo measurementsByPlane</span></PanelTitle>
            {visible("measurement-history") ? hasMeasurements ? (
              <>
                <p className="settings-persistence-note">La comparación representa valores técnicos producidos o revisados en cada estudio; no constituye una interpretación clínica longitudinal.</p>
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe requires keyboard focus for horizontally scrollable tables. */}
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla comparativa de mediciones longitudinales reales">
                  <table className="worklist-table longitudinal-measurements-table">
                    <thead>
                      <tr>
                        <th>Medición</th>
                        {studies.map((study) => <th key={study.caseId}>{formatDate(study.studyDate)}<small>{study.caseId}</small></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {comparativeRows.map((row) => (
                        <tr key={row.key}>
                          <td><strong>{row.label}</strong><small>{row.unit}</small></td>
                          {studies.map((study) => <td key={`${row.key}-${study.caseId}`}>{measurementCell(row.values.get(study.caseId))}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <EmptyLongitudinalState detail="Mediciones longitudinales no disponibles en measurementsByPlane." /> : hidden}
          </article>
        </section>
      )}

      {activeTab === "repository" && (
        <section className="history-grid quiet-history-grid">
          <article className="panel-card compact-card"><PanelTitle id="repository" title="Repositorio de estudios" />{visible("repository") ? renderTimeline(studies, onOpenStudyReview) : hidden}</article>
        </section>
      )}

      {activeTab === "activity" && (
        <section className="history-grid quiet-history-grid">
          <article className="panel-card compact-card">
            <PanelTitle id="activity-empty" title="Actividad y auditoría" />
            {visible("activity-empty") ? studies.length ? (
              <div className="timeline patient-timeline">
                {studies.map((study) => (
                  <article key={`${study.caseId}-activity`}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{displayReviewStatus(study.reviewStatus)}</strong>
                      <p>{study.caseId} · {formatDate(study.reviewedAt ?? study.updatedAt ?? study.createdAt)}</p>
                      <small>Prioridad {study.priority} · Correcciones persistidas: {study.corrections?.length ?? 0}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyLongitudinalState detail="Auditoría longitudinal por paciente no disponible." /> : hidden}
          </article>
        </section>
      )}
    </div>
  );
}
