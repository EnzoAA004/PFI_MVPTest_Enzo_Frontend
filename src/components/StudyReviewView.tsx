import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AiRunResponse, AuditEvent, Measurement, ReviewStatus, ReviewStatusResponse, StudyDetailResponse } from "../appTypes";
import { loadSelectedStudyDetail, SELECTED_STUDY_EVENT } from "../selectedStudyStorage";
import { AgentSummary } from "./AgentSummary";
import { AuditTrail } from "./AuditTrail";
import { MriSliceViewer } from "./MriSliceViewer";
import { PrivacyBanner } from "./PrivacyBanner";
import { ReviewBadge, StatusBadge } from "./StatusBadge";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";
import { VisibilityIcon } from "./VisibilityIcon";

const fallbackSeries = [
  { id: "series-sag-t2", name: "Sagittal T2", plane: "sagittal", sequence: "T2", sliceCount: 96, selectedSlice: 58, status: "ai_output_pending" },
  { id: "series-sag-t1", name: "Sagittal T1", plane: "sagittal", sequence: "T1", sliceCount: 96, selectedSlice: 58, status: "reference_only" },
  { id: "series-ax-t2", name: "Axial T2 L4-L5", plane: "axial", sequence: "T2", sliceCount: 48, selectedSlice: 24, status: "ai_output_pending" },
  { id: "series-ax-t1", name: "Axial T1", plane: "axial", sequence: "T1", sliceCount: 48, selectedSlice: 22, status: "reference_only" },
];

const fallbackMasks = [
  { id: "mask-vertebral-body", label: "Vertebral body", className: "vertebral_body", color: "#c8b28a", confidence: 0.86, editable: true, enabled: true, contours: [] },
  { id: "mask-disc", label: "Intervertebral disc", className: "disc", color: "#2563eb", confidence: 0.82, editable: true, enabled: true, contours: [] },
  { id: "mask-canal", label: "Spinal canal", className: "spinal_canal", color: "#16a34a", confidence: 0.79, editable: true, enabled: true, contours: [] },
  { id: "mask-root-left", label: "Left nerve root", className: "nerve_root", color: "#f59e0b", confidence: 0.72, editable: true, enabled: true, contours: [] },
  { id: "mask-foramen-right", label: "Right foramen", className: "foramen", color: "#8b5cf6", confidence: 0.7, editable: true, enabled: true, contours: [] },
];

type MeasurementRow = {
  id: string;
  label: string;
  level: string;
  aiValue: number | string;
  reviewerValue?: number | string | null;
  unit: string;
  confidence?: number;
  status?: string;
  outlier?: boolean;
};

type DeltaSeverity = "none" | "low" | "medium" | "high";

function outputTone(status?: string) {
  if (status === "reviewed") return "green";
  if (status === "real_inference") return "teal";
  if (status === "degraded") return "amber";
  return "purple";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function deltaSeverity(delta: number | null, outlier?: boolean): DeltaSeverity {
  if (outlier) return "high";
  if (delta === null) return "none";
  const absolute = Math.abs(delta);
  if (absolute >= 2) return "high";
  if (absolute >= 1) return "medium";
  if (absolute > 0) return "low";
  return "none";
}

function severityWeight(severity: DeltaSeverity) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}

function formatDelta(delta: number | null, unit: string) {
  if (delta === null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} ${unit}`;
}

function normalizeRow(item: any, fallbackPlane?: string): MeasurementRow {
  const value = item.aiValue ?? item.value ?? "";
  return {
    id: String(item.id ?? item.label ?? "measurement"),
    label: String(item.label ?? "Medicion"),
    level: String(item.level ?? (String(item.label ?? "").includes("L5-S1") ? "L5-S1" : "L4-L5")),
    aiValue: value,
    reviewerValue: item.reviewerValue ?? null,
    unit: String(item.unit ?? ""),
    confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    status: String(item.status ?? "pendiente"),
    outlier: Boolean(item.outlier),
  };
}

interface StudyReviewViewProps {
  run: AiRunResponse;
  studyReview?: any | null;
  measurements: Measurement[];
  auditTrail: AuditEvent[];
  saving: boolean;
  onMeasurementsChange: (measurements: Measurement[], detail: string) => void;
  onSaveReview: (status: ReviewStatus, notes: string) => Promise<ReviewStatusResponse | undefined>;
}

export function StudyReviewView({ run, studyReview, measurements, auditTrail, saving, onMeasurementsChange, onSaveReview }: StudyReviewViewProps) {
  const [tab, setTab] = useState<"Sagittal" | "Axial" | "3D Reconstruction">("Sagittal");
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [sliceBySeries, setSliceBySeries] = useState<Record<string, number>>({});
  const [maskVisibility, setMaskVisibility] = useState<Record<string, boolean>>({});
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(74);
  const [editMode, setEditMode] = useState(false);
  const [selectedMask, setSelectedMask] = useState("mask-disc");
  const [selectedLandmark, setSelectedLandmark] = useState("L4");
  const [reviewerValues, setReviewerValues] = useState<Record<string, string>>({});
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(run.review?.status ?? "pendiente");
  const [notes, setNotes] = useState(run.review?.notes ?? run.review?.observations ?? "");
  const [hiddenPanels, setHiddenPanels] = useState<Record<string, boolean>>({});
  const [selectedDetail, setSelectedDetail] = useState<StudyDetailResponse | null>(() => loadSelectedStudyDetail());

  useEffect(() => {
    const update = () => setSelectedDetail(loadSelectedStudyDetail());
    window.addEventListener(SELECTED_STUDY_EVENT, update);
    return () => window.removeEventListener(SELECTED_STUDY_EVENT, update);
  }, []);

  const selectedRun = selectedDetail?.runs?.[0];
  const displayRun = {
    ...run,
    runId: selectedRun?.runId ?? run.runId,
    caseId: selectedDetail?.study?.caseId ?? run.caseId,
    plane: selectedRun?.plane ?? selectedDetail?.study?.plane ?? run.plane,
    modelKey: selectedRun?.modelKey ?? selectedDetail?.study?.modelKey ?? run.modelKey,
    review: selectedDetail?.review ?? run.review,
  };
  const sourceMeasurements = selectedDetail?.measurements?.length ? selectedDetail.measurements : measurements;
  const review = useMemo(() => displayRun.review ?? { status: "pendiente" as ReviewStatus }, [displayRun.review]);
  const seriesList = Array.isArray(studyReview?.series) && studyReview.series.length ? studyReview.series : fallbackSeries;
  const masks = Array.isArray(studyReview?.masks) && studyReview.masks.length ? studyReview.masks : fallbackMasks;
  const landmarks = Array.isArray(studyReview?.landmarks) ? studyReview.landmarks : [];
  const aiOutput = studyReview?.aiOutput ?? {
    status: run.measurementsStatus ?? "ai_output_pending",
    label: run.measurementsStatus === "pending_real_inference" ? "AI output pending" : "Technical pipeline",
    description: run.measurementsDescription ?? "Pipeline tecnico preparado para recibir inferencia real.",
  };
  const currentSeries = seriesList.find((item: any) => item.id === selectedSeriesId) ?? seriesList.find((item: any) => item.plane === tab.toLowerCase()) ?? seriesList[0];
  const activeSlice = currentSeries ? sliceBySeries[currentSeries.id] ?? currentSeries.selectedSlice ?? 1 : 1;
  const studyMeasurements: MeasurementRow[] = Array.isArray(studyReview?.measurements) && studyReview.measurements.length
    ? studyReview.measurements.map((item: any) => normalizeRow(item, displayRun.plane))
    : sourceMeasurements.map((item) => normalizeRow({ id: item.id, label: item.label, level: item.label.includes("L5-S1") ? "L5-S1" : "L4-L5", value: item.value, aiValue: item.source === "Reviewer" ? item.value : item.value, reviewerValue: item.source === "Reviewer" ? item.value : null, unit: item.unit, confidence: item.confidence ?? 0.72, status: item.status, outlier: item.outlier }, displayRun.plane));

  function getPersistedReviewerValue(measurementId: string) {
    const persisted = sourceMeasurements.find((item) => item.id === measurementId && item.source === "Reviewer");
    return persisted?.value ?? "";
  }

  const resultRows = useMemo(() => {
    return studyMeasurements.map((item) => {
      const draftValue = reviewerValues[item.id];
      const persistedValue = getPersistedReviewerValue(item.id);
      const reviewerValue = draftValue ?? item.reviewerValue ?? persistedValue ?? "";
      const aiNumber = asNumber(item.aiValue);
      const reviewerNumber = asNumber(reviewerValue);
      const delta = aiNumber !== null && reviewerNumber !== null ? reviewerNumber - aiNumber : null;
      const severity = deltaSeverity(delta, item.outlier);
      const status = draftValue !== undefined && draftValue !== "" ? "draft" : persistedValue ? "guardado" : item.status ?? "pendiente";
      return { ...item, reviewerValue, draftValue, persistedValue, delta, severity, status };
    }).sort((a, b) => {
      const outlierDiff = Number(Boolean(b.outlier)) - Number(Boolean(a.outlier));
      if (outlierDiff !== 0) return outlierDiff;
      const severityDiff = severityWeight(b.severity) - severityWeight(a.severity);
      if (severityDiff !== 0) return severityDiff;
      return String(a.label).localeCompare(String(b.label));
    });
  }, [reviewerValues, sourceMeasurements, studyMeasurements]);

  const hasReviewerDrafts = Object.keys(reviewerValues).some((key) => reviewerValues[key] !== "");
  const reviewerDraftCount = Object.keys(reviewerValues).filter((key) => reviewerValues[key] !== "").length;
  const relevantChanges = resultRows.filter((row) => row.severity === "medium" || row.severity === "high").length;
  const outlierCount = resultRows.filter((row) => row.outlier).length;

  function toggleMask(maskId: string) {
    setMaskVisibility((current) => ({ ...current, [maskId]: !(current[maskId] ?? true) }));
  }

  function selectSeries(series: any) {
    setSelectedSeriesId(series.id);
    setTab(series.plane === "axial" ? "Axial" : "Sagittal");
  }

  function updateReviewerValue(measurement: MeasurementRow, value: string) {
    setReviewerValues((current) => ({ ...current, [measurement.id]: value }));
  }

  function toMeasurement(item: MeasurementRow): Measurement {
    const existing = sourceMeasurements.find((measurement) => measurement.id === item.id);
    const reviewerValue = reviewerValues[item.id];
    return {
      id: item.id,
      label: item.label,
      value: reviewerValue ?? existing?.value ?? item.reviewerValue ?? item.aiValue ?? "",
      unit: item.unit ?? existing?.unit ?? "",
      confidence: item.confidence ?? existing?.confidence,
      plane: existing?.plane ?? displayRun.plane,
      source: reviewerValue !== undefined && reviewerValue !== "" ? "Reviewer" : existing?.source ?? "AI",
      status: reviewerValue !== undefined && reviewerValue !== "" ? "editado" : existing?.status ?? "pendiente",
      outlier: Boolean(item.outlier ?? existing?.outlier),
      placeholder: existing?.placeholder,
    };
  }

  function commitReviewerMeasurements() {
    if (!hasReviewerDrafts) return;
    const existingIds = new Set(sourceMeasurements.map((item) => item.id));
    const updated = sourceMeasurements.map((item) => {
      const reviewerValue = reviewerValues[item.id];
      return reviewerValue !== undefined && reviewerValue !== "" ? { ...item, value: reviewerValue, source: "Reviewer" as const, status: "editado" as const } : item;
    });
    const appended = studyMeasurements
      .filter((item) => reviewerValues[item.id] !== undefined && reviewerValues[item.id] !== "" && !existingIds.has(item.id))
      .map(toMeasurement);
    onMeasurementsChange([...updated, ...appended], `${reviewerDraftCount} medicion/es guardadas por Reviewer desde Resultados IA`);
    setReviewerValues({});
  }

  async function save(status: ReviewStatus) {
    setReviewStatus(status);
    if (hasReviewerDrafts) commitReviewerMeasurements();
    await onSaveReview(status, notes);
  }

  function panelVisible(panelId: string) {
    return !hiddenPanels[panelId];
  }

  function togglePanel(panelId: string) {
    setHiddenPanels((current) => ({ ...current, [panelId]: !current[panelId] }));
  }

  function PanelTitle({ panelId, title, children }: { panelId: string; title: string; children?: ReactNode }) {
    const visible = panelVisible(panelId);
    return (
      <div className="section-title">
        <h2>{title}</h2>
        <div className="panel-title-actions">
          {children}
          <button className="visibility-toggle" onClick={() => togglePanel(panelId)} type="button" aria-label={visible ? `Ocultar ${title}` : `Mostrar ${title}`}>
            <VisibilityIcon visible={visible} />
          </button>
        </div>
      </div>
    );
  }

  const hiddenPlaceholder = <div className="panel-hidden-placeholder">Información oculta. Usá el control de visualización para desplegarla.</div>;

  return (
    <div className="view-stack review-workspace clinical-quiet">
      <section className="page-heading compact-heading">
        <div><p>Study Review Workspace</p><h1>{displayRun.caseId ?? studyReview?.caseId ?? "CASE-DEMO-0142"}</h1></div>
        <div className="safety-copy"><strong>Requiere revision profesional.</strong><span>Salida asistiva, no diagnostico clinico.</span></div>
      </section>

      <section className="review-grid">
        <aside className="left-column">
          <article className="panel-card compact-card">
            <PanelTitle panelId="case" title="Case Information"><ReviewBadge status={review.status ?? "pendiente"} /></PanelTitle>
            {panelVisible("case") ? (
              <dl className="info-list compact-info">
                <div><dt>Case ID</dt><dd>{displayRun.caseId ?? studyReview?.caseId}</dd></div>
                <div><dt>Subject Ref</dt><dd>{selectedDetail?.study?.patientId ?? studyReview?.patientId ?? "PAT-0087"}</dd></div>
                <div><dt>Study Date</dt><dd>{selectedDetail?.study?.studyDate ?? studyReview?.studyDate ?? "2026-07-01"}</dd></div>
                <div><dt>Plane</dt><dd>{currentSeries?.plane ?? displayRun.plane}</dd></div>
                <div><dt>Model</dt><dd>{displayRun.modelKey}</dd></div>
                <div><dt>Run ID</dt><dd>{displayRun.runId}</dd></div>
              </dl>
            ) : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card">
            <PanelTitle panelId="ai-output" title="AI Output"><StatusBadge tone={outputTone(aiOutput.status)}>{aiOutput.status ?? "ai_output_pending"}</StatusBadge></PanelTitle>
            {panelVisible("ai-output") ? <><strong>{aiOutput.label ?? "Study review contract ready"}</strong><p className="muted compact-copy">{aiOutput.description ?? "Workspace visual con datos de-identificados."}</p></> : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card">
            <PanelTitle panelId="series" title="Series" />
            {panelVisible("series") ? <div className="series-list compact-list">{seriesList.map((item: any) => <button className={`series-item ${currentSeries?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => selectSeries(item)} type="button"><span className="thumbnail" /><span><strong>{item.name}</strong><small>{item.plane} · {item.sliceCount} slices</small></span></button>)}</div> : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card">
            <PanelTitle panelId="masks" title="Masks" />
            {panelVisible("masks") ? <div className="mask-list compact-mask-list">{masks.map((mask: any) => { const visible = maskVisibility[mask.id] ?? mask.enabled ?? true; return <label className={selectedMask === mask.id ? "selected" : ""} key={mask.id}><input checked={visible} onChange={() => toggleMask(mask.id)} type="checkbox" /><i style={{ background: mask.color }} /><button onClick={() => setSelectedMask(mask.id)} type="button">{mask.label}</button><small>{visible ? "on" : "off"}</small></label>; })}</div> : hiddenPlaceholder}
          </article>
        </aside>

        <section className="center-column">
          <div className="workspace-tabs">{(["Sagittal", "Axial", "3D Reconstruction"] as const).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} type="button">{item}</button>)}</div>
          <div className="toolbar compact-toolbar">
            <button className={editMode ? "active" : ""} onClick={() => setEditMode((value) => !value)} type="button">Edit Mask</button>
            <button onClick={() => setSelectedLandmark("L4-L5")} type="button">Add Landmark</button>
            <button type="button">Recalculate</button>
            <button className={overlayEnabled ? "active" : ""} onClick={() => setOverlayEnabled((value) => !value)} type="button">Overlay</button>
            <label className="opacity-control">Opacity <input min="25" max="100" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} type="range" /></label>
          </div>
          <div className="edit-state compact-copy">Series: <strong>{currentSeries?.name}</strong> · Slice: <strong>{activeSlice}</strong> · Mask: <strong>{selectedMask}</strong> · Landmark: <strong>{selectedLandmark}</strong></div>
          {tab === "3D Reconstruction" ? (
            <article className="panel-card full-viewer"><SpineReconstructionPreview /></article>
          ) : (
            <div className="viewer-stack compact-viewer-stack">
              <MriSliceViewer variant={currentSeries?.plane === "axial" ? "axial" : "sagittal"} series={currentSeries} masks={masks} landmarks={landmarks} maskVisibility={maskVisibility} selectedMask={selectedMask} sliceIndex={activeSlice} onSliceChange={(slice) => currentSeries && setSliceBySeries((current) => ({ ...current, [currentSeries.id]: slice }))} overlayEnabled={overlayEnabled} overlayOpacity={overlayOpacity / 100} editMode={editMode} selectedLandmark={selectedLandmark} onSelectMask={setSelectedMask} onSelectLandmark={setSelectedLandmark} />
              <article className="panel-card compact-card legend-card">
                <PanelTitle panelId="legend" title="Legend" />
                {panelVisible("legend") ? <div className="legend-grid">{masks.map((mask: any) => <span key={mask.id}><i style={{ background: mask.color }} />{mask.label}</span>)}</div> : hiddenPlaceholder}
              </article>
            </div>
          )}
        </section>

        <aside className="right-column">
          <section className="panel-card results-panel">
            <PanelTitle panelId="results" title="Resultados IA y revisión">
              <StatusBadge tone={outlierCount > 0 ? "red" : relevantChanges > 0 ? "amber" : hasReviewerDrafts ? "amber" : "blue"}>
                {outlierCount > 0 ? `${outlierCount} outlier` : relevantChanges > 0 ? `${relevantChanges} cambio/s` : hasReviewerDrafts ? "cambios pendientes" : "editable"}
              </StatusBadge>
            </PanelTitle>
            {panelVisible("results") ? (
              <>
                <p className="muted compact-copy">Ordenado por outliers y cambios más relevantes. El delta compara Reviewer contra IA y se persiste solo al guardar.</p>
                <div className="comparison-table unified-results-table ai-reviewer-delta-table">
                  <div className="comparison-head"><span>Medición</span><span>IA</span><span>Reviewer</span><span>Delta</span><span>Estado</span></div>
                  {resultRows.map((item) => (
                    <div className={`comparison-row compact-comparison-row ${item.outlier ? "outlier-row" : ""}`} key={item.id}>
                      <span><strong>{item.label}</strong><small>{item.level} · {Math.round((item.confidence ?? 0) * 100)}%</small></span>
                      <span>{item.aiValue} {item.unit}</span>
                      <input value={String(item.reviewerValue ?? "")} onChange={(event) => updateReviewerValue(item, event.target.value)} placeholder="sin cambios" />
                      <span className={`delta-chip delta-${item.severity}`}>{formatDelta(item.delta, item.unit)}</span>
                      <span>{item.outlier ? "outlier" : item.status}</span>
                    </div>
                  ))}
                </div>
                <div className="review-actions compact-actions">
                  <button className="primary-button" disabled={!hasReviewerDrafts || saving} onClick={commitReviewerMeasurements} type="button">Guardar medidas</button>
                  <button className="ghost-button" disabled={!hasReviewerDrafts || saving} onClick={() => setReviewerValues({})} type="button">Descartar</button>
                  {hasReviewerDrafts && <span className="muted">{reviewerDraftCount} cambio/s</span>}
                </div>
              </>
            ) : hiddenPlaceholder}
          </section>

          <AgentSummary agentDecision={studyReview?.aiOutput?.agentDecision ?? run.agentDecision} />
          <section className="panel-card notes-card compact-card">
            <PanelTitle panelId="decision" title="Notas y decisión" />
            {panelVisible("decision") ? <><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones profesionales de revision..." /><div className="review-actions compact-actions"><select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}><option value="pendiente">pendiente</option><option value="aceptado">aceptado</option><option value="observado">observado</option><option value="descartado">descartado</option></select><button className="ghost-button" disabled={saving} onClick={() => void save(reviewStatus)} type="button">Save Draft</button><button className="primary-button" disabled={saving} onClick={() => void save("aceptado")} type="button">Approve</button><button className="warning-button" disabled={saving} onClick={() => void save("observado")} type="button">Observe</button></div></> : hiddenPlaceholder}
          </section>
          <section className="panel-card compact-card collapsible-audit"><PanelTitle panelId="audit" title="Audit Trail" />{panelVisible("audit") ? <AuditTrail events={auditTrail.slice(0, 4)} /> : hiddenPlaceholder}</section>
        </aside>
      </section>
      <PrivacyBanner />
    </div>
  );
}
