import { useMemo, useState } from "react";
import type { AiRunResponse, AuditEvent, Measurement, ReviewStatus, ReviewStatusResponse } from "../types";
import { AgentSummary } from "./AgentSummary";
import { AuditTrail } from "./AuditTrail";
import { MeasurementsPanel } from "./MeasurementsPanel";
import { MriSliceViewer } from "./MriSliceViewer";
import { PrivacyBanner } from "./PrivacyBanner";
import { ReviewBadge, StatusBadge } from "./StatusBadge";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";

const series = ["Sagittal T2", "Sagittal T1", "Axial T2", "Axial T1"];

interface StudyReviewViewProps {
  run: AiRunResponse;
  measurements: Measurement[];
  auditTrail: AuditEvent[];
  saving: boolean;
  onMeasurementsChange: (measurements: Measurement[], detail: string) => void;
  onSaveReview: (status: ReviewStatus, notes: string) => Promise<ReviewStatusResponse | undefined>;
}

export function StudyReviewView({
  run,
  measurements,
  auditTrail,
  saving,
  onMeasurementsChange,
  onSaveReview,
}: StudyReviewViewProps) {
  const [tab, setTab] = useState<"Sagittal" | "Axial" | "3D Reconstruction">("Sagittal");
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedMask, setSelectedMask] = useState("disc-space");
  const [selectedLandmark, setSelectedLandmark] = useState("L4");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(run.review?.status ?? "pendiente");
  const [notes, setNotes] = useState(run.review?.notes ?? run.review?.observations ?? "");

  const review = useMemo(() => run.review ?? { status: "pendiente" as ReviewStatus }, [run.review]);

  async function save(status: ReviewStatus) {
    setReviewStatus(status);
    await onSaveReview(status, notes);
  }

  return (
    <div className="view-stack review-workspace">
      <section className="page-heading">
        <div>
          <p>Study Review Workspace</p>
          <h1>{run.caseId ?? "CASE-DEMO-0142"}</h1>
        </div>
        <div className="safety-copy">
          <strong>Requiere revision profesional.</strong>
          <span>Not for clinical diagnosis. Human review required.</span>
        </div>
      </section>

      <section className="review-grid">
        <aside className="left-column">
          <article className="panel-card">
            <div className="section-title"><h2>Case Information</h2><ReviewBadge status={review.status ?? "pendiente"} /></div>
            <dl className="info-list">
              <div><dt>Case ID</dt><dd>{run.caseId}</dd></div>
              <div><dt>Patient ID</dt><dd>PAT-0087</dd></div>
              <div><dt>Study Date</dt><dd>2026-07-01</dd></div>
              <div><dt>Modality</dt><dd>MRI</dd></div>
              <div><dt>Plane</dt><dd>{run.plane}</dd></div>
              <div><dt>Model Key</dt><dd>{run.modelKey}</dd></div>
              <div><dt>Run ID</dt><dd>{run.runId}</dd></div>
              <div><dt>Reviewer</dt><dd>{review.reviewer || "Reviewer"}</dd></div>
            </dl>
          </article>
          <article className="panel-card">
            <div className="section-title"><h2>Patient-Safe Metadata</h2><StatusBadge tone="teal">De-identified</StatusBadge></div>
            <dl className="info-list">
              <div><dt>Age at study</dt><dd>No informado</dd></div>
              <div><dt>Sex</dt><dd>No informado</dd></div>
              <div><dt>Body Region</dt><dd>Lumbar Spine</dd></div>
              <div><dt>Study Description</dt><dd>Lumbar spine MRI</dd></div>
              <div><dt>Series Count</dt><dd>4</dd></div>
              <div><dt>Image Resolution</dt><dd>Mock 512 x 512</dd></div>
            </dl>
            <p className="muted">Metadata seguro y de-identificado para demo academica.</p>
          </article>
          <article className="panel-card">
            <div className="section-title"><h2>Series Navigator</h2></div>
            <div className="series-list">
              {series.map((item) => (
                <button className="series-item" key={item} type="button">
                  <span className="thumbnail" />
                  <strong>{item}</strong>
                </button>
              ))}
            </div>
          </article>
        </aside>

        <section className="center-column">
          <div className="workspace-tabs">
            {(["Sagittal", "Axial", "3D Reconstruction"] as const).map((item) => (
              <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} type="button">{item}</button>
            ))}
          </div>
          <div className="toolbar">
            <button className={editMode ? "active" : ""} onClick={() => setEditMode((value) => !value)} type="button">Edit Mask</button>
            <button onClick={() => setSelectedLandmark("L4-L5")} type="button">Add Landmark</button>
            <button type="button">Recalculate</button>
            <button type="button">Undo</button>
            <button onClick={() => void save("aceptado")} type="button">Approve</button>
            <button className={overlayEnabled ? "active" : ""} onClick={() => setOverlayEnabled((value) => !value)} type="button">Toggle AI Overlay</button>
          </div>
          <div className="edit-state">
            Selected mask: <strong>{selectedMask}</strong> · Selected landmark: <strong>{selectedLandmark}</strong>
          </div>
          {tab === "3D Reconstruction" ? (
            <article className="panel-card full-viewer"><SpineReconstructionPreview /></article>
          ) : (
            <div className="viewer-stack">
              <MriSliceViewer
                variant="sagittal"
                overlayEnabled={overlayEnabled}
                editMode={editMode}
                selectedLandmark={selectedLandmark}
                onSelectMask={setSelectedMask}
                onSelectLandmark={setSelectedLandmark}
              />
              <MriSliceViewer
                variant="axial"
                overlayEnabled={overlayEnabled}
                editMode={editMode}
                selectedLandmark={selectedLandmark}
                onSelectMask={setSelectedMask}
                onSelectLandmark={setSelectedLandmark}
              />
            </div>
          )}
        </section>

        <aside className="right-column">
          <MeasurementsPanel
            measurements={measurements}
            inferenceStatus={run.measurementsStatus}
            description={run.measurementsDescription}
            onChange={onMeasurementsChange}
          />
          <AgentSummary agentDecision={run.agentDecision} />
          <section className="panel-card notes-card">
            <div className="section-title"><h2>Notes</h2></div>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones profesionales de revision..." />
            <div className="review-actions">
              <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}>
                <option value="pendiente">pendiente</option>
                <option value="aceptado">aceptado</option>
                <option value="observado">observado</option>
                <option value="descartado">descartado</option>
              </select>
              <button className="ghost-button" disabled={saving} onClick={() => void save(reviewStatus)} type="button">Save Draft</button>
              <button className="primary-button" disabled={saving} onClick={() => void save("aceptado")} type="button">Approve & Complete</button>
              <button className="warning-button" disabled={saving} onClick={() => void save("observado")} type="button">Mark Observed</button>
            </div>
          </section>
          <section className="panel-card">
            <div className="section-title"><h2>Audit Trail</h2></div>
            <AuditTrail events={auditTrail} />
          </section>
        </aside>
      </section>
      <PrivacyBanner />
    </div>
  );
}
