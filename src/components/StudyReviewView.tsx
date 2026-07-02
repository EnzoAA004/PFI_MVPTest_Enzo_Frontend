import { useMemo, useState } from "react";
import type { AiRunResponse, AuditEvent, Measurement, ReviewStatus, ReviewStatusResponse } from "../appTypes";
import { AgentSummary } from "./AgentSummary";
import { AuditTrail } from "./AuditTrail";
import { MeasurementsPanel } from "./MeasurementsPanel";
import { MriSliceViewer } from "./MriSliceViewer";
import { PrivacyBanner } from "./PrivacyBanner";
import { ReviewBadge, StatusBadge } from "./StatusBadge";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";

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

function outputTone(status?: string) {
  if (status === "reviewed") return "green";
  if (status === "real_inference") return "teal";
  if (status === "degraded") return "amber";
  return "purple";
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

export function StudyReviewView({
  run,
  studyReview,
  measurements,
  auditTrail,
  saving,
  onMeasurementsChange,
  onSaveReview,
}: StudyReviewViewProps) {
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

  const review = useMemo(() => run.review ?? { status: "pendiente" as ReviewStatus }, [run.review]);
  const seriesList = Array.isArray(studyReview?.series) && studyReview.series.length ? studyReview.series : fallbackSeries;
  const masks = Array.isArray(studyReview?.masks) && studyReview.masks.length ? studyReview.masks : fallbackMasks;
  const landmarks = Array.isArray(studyReview?.landmarks) ? studyReview.landmarks : [];
  const aiOutput = studyReview?.aiOutput ?? {
    status: run.measurementsStatus ?? "ai_output_pending",
    label: run.measurementsStatus === "pending_real_inference" ? "AI output pending" : "Technical pipeline",
    description: run.measurementsDescription ?? "Pipeline tecnico preparado para recibir inferencia real.",
  };
  const currentSeries =
    seriesList.find((item: any) => item.id === selectedSeriesId) ??
    seriesList.find((item: any) => item.plane === tab.toLowerCase()) ??
    seriesList[0];
  const activeSlice = currentSeries ? sliceBySeries[currentSeries.id] ?? currentSeries.selectedSlice ?? 1 : 1;
  const studyMeasurements =
    Array.isArray(studyReview?.measurements) && studyReview.measurements.length
      ? studyReview.measurements
      : measurements.map((item) => ({
          id: item.id,
          label: item.label,
          level: item.label.includes("L5-S1") ? "L5-S1" : "L4-L5",
          value: Number(item.value) || 0,
          aiValue: Number(item.value) || 0,
          reviewerValue: null,
          unit: item.unit,
          confidence: item.confidence ?? 0.72,
          status: item.status,
          outlier: Boolean(item.outlier),
          linkedLandmarks: [],
        }));
  const hasReviewerDrafts = Object.keys(reviewerValues).some((key) => reviewerValues[key] !== "");
  const reviewerDraftCount = Object.keys(reviewerValues).filter((key) => reviewerValues[key] !== "").length;

  function toggleMask(maskId: string) {
    setMaskVisibility((current) => ({ ...current, [maskId]: !(current[maskId] ?? true) }));
  }

  function selectSeries(series: any) {
    setSelectedSeriesId(series.id);
    setTab(series.plane === "axial" ? "Axial" : "Sagittal");
  }

  function updateReviewerValue(measurement: any, value: string) {
    setReviewerValues((current) => ({ ...current, [measurement.id]: value }));
  }

  function getPersistedReviewerValue(measurementId: string) {
    const persisted = measurements.find((item) => item.id === measurementId && item.source === "Reviewer");
    return persisted?.value ?? "";
  }

  function commitReviewerMeasurements() {
    if (!hasReviewerDrafts) return;
    const changedIds = new Set(Object.keys(reviewerValues).filter((key) => reviewerValues[key] !== ""));
    const nextMeasurements = measurements.map((item) =>
      changedIds.has(item.id)
        ? { ...item, value: reviewerValues[item.id], source: "Reviewer" as const, status: "editado" as const }
        : item,
    );
    onMeasurementsChange(nextMeasurements, `${changedIds.size} medicion/es guardadas por Reviewer desde AI vs Reviewer`);
    setReviewerValues({});
  }

  async function save(status: ReviewStatus) {
    setReviewStatus(status);
    if (hasReviewerDrafts) {
      commitReviewerMeasurements();
    }
    await onSaveReview(status, notes);
  }

  return (
    <div className="view-stack review-workspace">
      <section className="page-heading">
        <div><p>Study Review Workspace</p><h1>{run.caseId ?? studyReview?.caseId ?? "CASE-DEMO-0142"}</h1></div>
        <div className="safety-copy"><strong>Requiere revision profesional.</strong><span>Not for clinical diagnosis. Human review required.</span></div>
      </section>

      <section className="review-grid">
        <aside className="left-column">
          <article className="panel-card">
            <div className="section-title">
              <h2>Case Information</h2>
              <ReviewBadge status={review.status ?? "pendiente"} />
            </div>
            <dl className="info-list">
              <div><dt>Case ID</dt><dd>{run.caseId ?? studyReview?.caseId}</dd></div>
              <div><dt>Patient ID</dt><dd>{studyReview?.patientId ?? "PAT-0087"}</dd></div>
              <div><dt>Study Date</dt><dd>{studyReview?.studyDate ?? "2026-07-01"}</dd></div>
              <div><dt>Modality</dt><dd>MRI</dd></div>
              <div><dt>Plane</dt><dd>{currentSeries?.plane ?? run.plane}</dd></div>
              <div><dt>Model Key</dt><dd>{run.modelKey}</dd></div>
              <div><dt>Run ID</dt><dd>{run.runId}</dd></div>
              <div><dt>Reviewer</dt><dd>{review.reviewer || "Reviewer"}</dd></div>
            </dl>
          </article>

          <article className="panel-card">
            <div className="section-title">
              <h2>AI Output</h2>
              <StatusBadge tone={outputTone(aiOutput.status)}>{aiOutput.status ?? "ai_output_pending"}</StatusBadge>
            </div>
            <strong>{aiOutput.label ?? "Study review contract ready"}</strong>
            <p className="muted">{aiOutput.description ?? "Visual workspace using fallback/mock data until real inference is available."}</p>
          </article>

          <article className="panel-card">
            <div className="section-title"><h2>Patient-Safe Metadata</h2><StatusBadge tone="teal">De-identified</StatusBadge></div>
            <dl className="info-list">
              <div><dt>Age at study</dt><dd>{studyReview?.metadata?.ageAtStudy ?? "No informado"}</dd></div>
              <div><dt>Sex</dt><dd>{studyReview?.metadata?.sex ?? "No informado"}</dd></div>
              <div><dt>Body Region</dt><dd>{studyReview?.metadata?.bodyRegion ?? "Lumbar Spine"}</dd></div>
              <div><dt>Study Description</dt><dd>{studyReview?.metadata?.studyDescription ?? "Lumbar spine MRI"}</dd></div>
              <div><dt>Series Count</dt><dd>{seriesList.length}</dd></div>
              <div><dt>Image Resolution</dt><dd>{studyReview?.metadata?.imageResolution ?? "Mock 512 x 512"}</dd></div>
            </dl>
            <p className="muted">Metadata seguro y de-identificado para demo academica.</p>
          </article>

          <article className="panel-card">
            <div className="section-title"><h2>Series Navigator</h2></div>
            <div className="series-list">
              {seriesList.map((item: any) => (
                <button className={`series-item ${currentSeries?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => selectSeries(item)} type="button">
                  <span className="thumbnail" />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.plane} · {item.sequence} · {item.sliceCount} slices · {item.status}</small>
                  </span>
                </button>
              ))}
            </div>
          </article>

          <article className="panel-card">
            <div className="section-title"><h2>Mask classes</h2></div>
            <div className="mask-list">
              {masks.map((mask: any) => {
                const visible = maskVisibility[mask.id] ?? mask.enabled ?? true;
                return (
                  <label className={selectedMask === mask.id ? "selected" : ""} key={mask.id}>
                    <input checked={visible} onChange={() => toggleMask(mask.id)} type="checkbox" />
                    <i style={{ background: mask.color }} />
                    <button onClick={() => setSelectedMask(mask.id)} type="button">{mask.label}</button>
                    <small>{Math.round((mask.confidence ?? 0) * 100)}% · {visible ? "visible" : "hidden"}</small>
                  </label>
                );
              })}
            </div>
          </article>
        </aside>

        <section className="center-column">
          <div className="workspace-tabs">{(["Sagittal", "Axial", "3D Reconstruction"] as const).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} type="button">{item}</button>)}</div>
          <div className="toolbar">
            <button className={editMode ? "active" : ""} onClick={() => setEditMode((value) => !value)} type="button">Edit Mask</button>
            <button onClick={() => setSelectedLandmark("L4-L5")} type="button">Add Landmark</button>
            <button type="button">Recalculate</button>
            <button type="button">Undo</button>
            <button onClick={() => void save("aceptado")} type="button">Approve</button>
            <button className={overlayEnabled ? "active" : ""} onClick={() => setOverlayEnabled((value) => !value)} type="button">Toggle AI Overlay</button>
            <label className="opacity-control">Overlay <input min="25" max="100" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} type="range" /></label>
          </div>
          <div className="edit-state">
            Series: <strong>{currentSeries?.name}</strong> · Slice: <strong>{activeSlice}</strong> · Selected mask: <strong>{selectedMask}</strong> · Selected landmark: <strong>{selectedLandmark}</strong> · Overlay opacity: <strong>{overlayOpacity}%</strong>
          </div>
          {tab === "3D Reconstruction" ? <article className="panel-card full-viewer"><SpineReconstructionPreview /></article> : (
            <div className="viewer-stack">
              <MriSliceViewer
                variant={currentSeries?.plane === "axial" ? "axial" : "sagittal"}
                series={currentSeries}
                masks={masks}
                landmarks={landmarks}
                maskVisibility={maskVisibility}
                selectedMask={selectedMask}
                sliceIndex={activeSlice}
                onSliceChange={(slice) => currentSeries && setSliceBySeries((current) => ({ ...current, [currentSeries.id]: slice }))}
                overlayEnabled={overlayEnabled}
                overlayOpacity={overlayOpacity / 100}
                editMode={editMode}
                selectedLandmark={selectedLandmark}
                onSelectMask={setSelectedMask}
                onSelectLandmark={setSelectedLandmark}
              />
              <article className="panel-card">
                <div className="section-title"><h2>Segmentation legend</h2></div>
                <div className="legend-grid">
                  {masks.map((mask: any) => <span key={mask.id}><i style={{ background: mask.color }} />{mask.label}</span>)}
                </div>
              </article>
            </div>
          )}
        </section>

        <aside className="right-column">
          <section className="panel-card">
            <div className="section-title">
              <h2>AI vs Reviewer</h2>
              <StatusBadge tone={hasReviewerDrafts ? "amber" : "blue"}>{hasReviewerDrafts ? "draft" : "editable"}</StatusBadge>
            </div>
            <p className="muted">Las mediciones editadas se guardan en backend/Postgres solo al hacer clic en Guardar cambios o aprobar la revision.</p>
            <div className="comparison-table">
              <div className="comparison-head"><span>Metric</span><span>AI value</span><span>Reviewer</span><span>Status</span></div>
              {studyMeasurements.map((item: any) => {
                const persistedReviewerValue = getPersistedReviewerValue(item.id);
                const draftValue = reviewerValues[item.id];
                const inputValue = draftValue ?? item.reviewerValue ?? persistedReviewerValue ?? "";
                const status = draftValue !== undefined && draftValue !== "" ? "draft" : persistedReviewerValue ? "guardado" : item.status ?? "pendiente";
                return (
                  <div className="comparison-row" key={item.id}>
                    <span><strong>{item.label}</strong><small>{item.level ?? "L4-L5"} · {Math.round((item.confidence ?? 0) * 100)}%</small></span>
                    <span>{item.aiValue ?? item.value} {item.unit}</span>
                    <input value={inputValue} onChange={(event) => updateReviewerValue(item, event.target.value)} placeholder="review" />
                    <span>{status}</span>
                  </div>
                );
              })}
            </div>
            <div className="review-actions">
              <button className="primary-button" disabled={!hasReviewerDrafts || saving} onClick={commitReviewerMeasurements} type="button">Guardar cambios de medidas</button>
              <button className="ghost-button" disabled={!hasReviewerDrafts || saving} onClick={() => setReviewerValues({})} type="button">Descartar cambios</button>
              {hasReviewerDrafts && <span className="muted">{reviewerDraftCount} cambio/s pendiente/s</span>}
            </div>
          </section>
          <MeasurementsPanel measurements={measurements} inferenceStatus={run.measurementsStatus} description={run.measurementsDescription} onChange={onMeasurementsChange} />
          <AgentSummary agentDecision={studyReview?.aiOutput?.agentDecision ?? run.agentDecision} />
          <section className="panel-card notes-card">
            <div className="section-title"><h2>Notes</h2></div>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones profesionales de revision..." />
            <div className="review-actions">
              <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}><option value="pendiente">pendiente</option><option value="aceptado">aceptado</option><option value="observado">observado</option><option value="descartado">descartado</option></select>
              <button className="ghost-button" disabled={saving} onClick={() => void save(reviewStatus)} type="button">Save Draft</button>
              <button className="primary-button" disabled={saving} onClick={() => void save("aceptado")} type="button">Approve & Complete</button>
              <button className="warning-button" disabled={saving} onClick={() => void save("observado")} type="button">Mark Observed</button>
            </div>
          </section>
          <section className="panel-card"><div className="section-title"><h2>Audit Trail</h2></div><AuditTrail events={auditTrail} /></section>
        </aside>
      </section>
      <PrivacyBanner />
    </div>
  );
}
