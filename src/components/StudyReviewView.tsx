import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AiModelArtifact, AiRunResponse, AgentQuality, AuditEvent, Measurement, ReviewStatus, ReviewStatusResponse, StudyDetailResponse, StudyMask, StudySeries } from "../appTypes";
import { loadSelectedStudyDetail, SELECTED_STUDY_EVENT } from "../selectedStudyStorage";
import { AgentSummary } from "./AgentSummary";
import { AuditTrail } from "./AuditTrail";
import { MriSliceViewer } from "./MriSliceViewer";
import { PrivacyBanner } from "./PrivacyBanner";
import { ReviewBadge, StatusBadge } from "./StatusBadge";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";
import { VisibilityIcon } from "./VisibilityIcon";

const fallbackSeries: StudySeries[] = [
  { id: "series-sag-t2", name: "Sagital T2", plane: "sagittal", sequence: "T2", sliceCount: 96, selectedSlice: 58, status: "ai_output_pending" },
  { id: "series-sag-t1", name: "Sagital T1", plane: "sagittal", sequence: "T1", sliceCount: 96, selectedSlice: 58, status: "reference_only" },
  { id: "series-ax-t2", name: "Axial T2 L4-L5", plane: "axial", sequence: "T2", sliceCount: 48, selectedSlice: 24, status: "ai_output_pending" },
  { id: "series-ax-t1", name: "Axial T1", plane: "axial", sequence: "T1", sliceCount: 48, selectedSlice: 22, status: "reference_only" },
];

const fallbackMasks: StudyMask[] = [
  { id: "mask-vertebral-body", label: "Cuerpo vertebral", className: "vertebral_body", color: "#c8b28a", confidence: 0.86, editable: true, enabled: true, contours: [] },
  { id: "mask-disc", label: "Disco intervertebral", className: "disc", color: "#2563eb", confidence: 0.82, editable: true, enabled: true, contours: [] },
  { id: "mask-canal", label: "Canal espinal", className: "spinal_canal", color: "#16a34a", confidence: 0.79, editable: true, enabled: true, contours: [] },
  { id: "mask-root-left", label: "Raíz nerviosa izquierda", className: "nerve_root", color: "#f59e0b", confidence: 0.72, editable: true, enabled: true, contours: [] },
  { id: "mask-foramen-right", label: "Foramen derecho", className: "foramen", color: "#8b5cf6", confidence: 0.7, editable: true, enabled: true, contours: [] },
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

interface StudyReviewViewProps {
  run: AiRunResponse;
  studyReview?: any | null;
  measurements: Measurement[];
  auditTrail: AuditEvent[];
  saving: boolean;
  onMeasurementsChange: (measurements: Measurement[], detail: string) => void;
  onSaveReview: (status: ReviewStatus, notes: string) => Promise<ReviewStatusResponse | undefined>;
}

function outputTone(status?: string) {
  if (status === "reviewed" || status === "contract_ready") return "green";
  if (status === "real_inference") return "teal";
  if (status === "degraded") return "amber";
  return "purple";
}

function outputStatusLabel(status?: string) {
  if (status === "contract_ready") return "contrato listo";
  if (status === "real_inference") return "inferencia real";
  if (status === "reviewed") return "revisado";
  if (status === "degraded") return "degradado";
  if (status === "ai_output_pending") return "salida pendiente";
  return status ?? "sin estado";
}

function inferenceModeLabel(value?: string) {
  if (value === "contract") return "modo contrato";
  if (value === "real") return "modo real";
  if (value === "mock") return "modo simulado";
  return value ?? "sin datos";
}

function traceabilityTone(inferenceMode?: string, artifact?: AiModelArtifact) {
  if (inferenceMode === "real" && artifact?.exists) return "green";
  if (inferenceMode === "contract") return "amber";
  return "blue";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" ? value as Record<string, any> : undefined;
}

function boolText(value?: boolean) {
  if (value === undefined) return "sin datos";
  return value ? "sí" : "no";
}

function readinessLabel(value?: string) {
  if (value === "real_artifact_available") return "artifact real disponible";
  if (value === "contract_only_missing_artifact") return "modo contrato: falta artifact";
  return value ?? "sin datos";
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

function normalizeRow(item: any): MeasurementRow {
  const value = item.aiValue ?? item.value ?? "";
  return {
    id: String(item.id ?? item.label ?? "measurement"),
    label: String(item.label ?? "Medición"),
    level: String(item.level ?? (String(item.label ?? "").includes("L5-S1") ? "L5-S1" : "L4-L5")),
    aiValue: value,
    reviewerValue: item.reviewerValue ?? null,
    unit: String(item.unit ?? ""),
    confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    status: String(item.status ?? "pendiente"),
    outlier: Boolean(item.outlier),
  };
}

function safeFileFragment(value?: string) {
  return String(value ?? "study-review").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 80);
}

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

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function qualityFrom(run: AiRunResponse): AgentQuality | undefined {
  const metadata = asRecord(run.metadata);
  return run.quality ?? asRecord(metadata?.quality) as AgentQuality | undefined;
}

function artifactFrom(run: AiRunResponse): AiModelArtifact | undefined {
  const metadata = asRecord(run.metadata);
  return run.modelArtifact?.artifact ?? asRecord(metadata?.modelArtifact) as AiModelArtifact | undefined;
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
  const displayRun: AiRunResponse = {
    ...run,
    runId: selectedRun?.runId ?? run.runId,
    caseId: selectedDetail?.study?.caseId ?? run.caseId,
    plane: selectedRun?.plane ?? selectedDetail?.study?.plane ?? run.plane,
    modelKey: selectedRun?.modelKey ?? selectedDetail?.study?.modelKey ?? run.modelKey,
    review: selectedDetail?.review ?? run.review,
  };

  const hasPipelineVisualContract = Array.isArray(run.series) && run.series.length > 0;
  const pipelineMeasurements = hasPipelineVisualContract && Array.isArray(run.normalizedMeasurements) ? run.normalizedMeasurements : [];
  const sourceMeasurements = selectedDetail?.measurements?.length ? selectedDetail.measurements : pipelineMeasurements.length ? pipelineMeasurements : measurements;
  const review = useMemo(() => displayRun.review ?? { status: "pendiente" as ReviewStatus }, [displayRun.review]);
  const seriesList = hasPipelineVisualContract ? run.series ?? fallbackSeries : Array.isArray(studyReview?.series) && studyReview.series.length ? studyReview.series : fallbackSeries;
  const masks = hasPipelineVisualContract && Array.isArray(run.masks) ? run.masks : Array.isArray(studyReview?.masks) && studyReview.masks.length ? studyReview.masks : fallbackMasks;
  const landmarks = hasPipelineVisualContract && Array.isArray(run.landmarks) ? run.landmarks : Array.isArray(studyReview?.landmarks) ? studyReview.landmarks : [];
  const aiOutput = hasPipelineVisualContract && run.aiOutput ? run.aiOutput : studyReview?.aiOutput ?? {
    status: run.measurementsStatus ?? "ai_output_pending",
    label: run.measurementsStatus === "pending_real_inference" ? "Salida IA pendiente" : "Salida técnica",
    description: run.measurementsDescription ?? "Pipeline técnico preparado para recibir inferencia real.",
  };
  const currentSeries = seriesList.find((item: any) => item.id === selectedSeriesId) ?? seriesList.find((item: any) => item.plane === tab.toLowerCase()) ?? seriesList[0];
  const activeSlice = currentSeries ? sliceBySeries[currentSeries.id] ?? currentSeries.selectedSlice ?? 1 : 1;

  const studyMeasurements: MeasurementRow[] = hasPipelineVisualContract && pipelineMeasurements.length
    ? pipelineMeasurements.map((item) => normalizeRow({ ...item, aiValue: item.aiValue ?? item.value, reviewerValue: item.reviewerValue ?? null, confidence: item.confidence ?? 0.72 }))
    : Array.isArray(studyReview?.measurements) && studyReview.measurements.length
      ? studyReview.measurements.map((item: any) => normalizeRow(item))
      : sourceMeasurements.map((item) => normalizeRow({ ...item, aiValue: item.aiValue ?? item.value, reviewerValue: item.source === "Reviewer" ? item.value : item.reviewerValue ?? null, confidence: item.confidence ?? 0.72 }));

  const metadata = asRecord(run.metadata);
  const modelArtifact = run.modelArtifact;
  const artifact = artifactFrom(run);
  const quality = qualityFrom(run);
  const inferenceMode = aiOutput.inferenceMode ?? String(metadata?.inferenceMode ?? "contract");
  const requestedInferenceMode = aiOutput.requestedInferenceMode ?? String(metadata?.requestedInferenceMode ?? metadata?.inferenceMode ?? inferenceMode);
  const modelReadiness = aiOutput.modelReadiness ?? modelArtifact?.readiness ?? String(metadata?.modelReadiness ?? "sin datos");
  const realInferenceAvailable = aiOutput.realInferenceAvailable ?? modelArtifact?.availableForRealInference;

  function getPersistedReviewerValue(measurementId: string) {
    const persisted = sourceMeasurements.find((item) => item.id === measurementId && item.source === "Reviewer");
    return persisted?.value ?? "";
  }

  const resultRows = useMemo(() => studyMeasurements.map((item) => {
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
  }), [reviewerValues, sourceMeasurements, studyMeasurements]);

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
      level: item.level,
      value: reviewerValue ?? existing?.value ?? item.reviewerValue ?? item.aiValue ?? "",
      aiValue: item.aiValue ?? existing?.aiValue,
      reviewerValue: reviewerValue ?? item.reviewerValue ?? existing?.reviewerValue ?? null,
      unit: item.unit ?? existing?.unit ?? "",
      confidence: item.confidence ?? existing?.confidence,
      plane: existing?.plane ?? displayRun.plane,
      source: reviewerValue !== undefined && reviewerValue !== "" ? "Reviewer" : existing?.source ?? "AI",
      status: reviewerValue !== undefined && reviewerValue !== "" ? "editado" : existing?.status ?? "pendiente",
      outlier: Boolean(item.outlier ?? existing?.outlier),
      placeholder: existing?.placeholder,
      linkedLandmarks: existing?.linkedLandmarks,
    };
  }

  function commitReviewerMeasurements() {
    if (!hasReviewerDrafts) return;
    const existingIds = new Set(sourceMeasurements.map((item) => item.id));
    const updated = sourceMeasurements.map((item) => {
      const reviewerValue = reviewerValues[item.id];
      return reviewerValue !== undefined && reviewerValue !== "" ? { ...item, value: reviewerValue, reviewerValue, source: "Reviewer" as const, status: "editado" as const } : item;
    });
    const appended = studyMeasurements
      .filter((item) => reviewerValues[item.id] !== undefined && reviewerValues[item.id] !== "" && !existingIds.has(item.id))
      .map(toMeasurement);
    onMeasurementsChange([...updated, ...appended], `${reviewerDraftCount} medicion/es guardadas por Reviewer desde Resultados IA`);
    setReviewerValues({});
  }

  function exportPayload() {
    const reviewed = resultRows.filter((row) => row.reviewerValue !== null && row.reviewerValue !== "").length;
    return {
      exportType: "academic_deidentified_review",
      generatedAt: new Date().toISOString(),
      caseId: displayRun.caseId,
      subjectRef: selectedDetail?.study?.patientId ?? run.patientId ?? studyReview?.patientId ?? "PAT-0087",
      studyDate: selectedDetail?.study?.studyDate ?? run.studyDate ?? studyReview?.studyDate ?? "2026-07-01",
      runId: displayRun.runId,
      plane: displayRun.plane,
      modelKey: displayRun.modelKey,
      modelVersion: displayRun.modelVersion,
      inferenceMode,
      requestedInferenceMode,
      modelReadiness,
      modelArtifact: artifact,
      quality,
      reviewStatus,
      notes,
      summary: { measurementsTotal: resultRows.length, measurementsReviewed: reviewed, outliers: outlierCount, relevantChanges, reviewerDrafts: reviewerDraftCount },
      governance: { scope: "academic/research only", deidentified: true, rawImagesIncluded: false, humanReviewRequired: true, notClinicalDiagnosis: true },
      measurements: resultRows.map((row) => ({ id: row.id, label: row.label, level: row.level, aiValue: row.aiValue, reviewerValue: row.reviewerValue || null, delta: row.delta, deltaFormatted: formatDelta(row.delta, row.unit), unit: row.unit, severity: row.severity, status: row.status, outlier: Boolean(row.outlier), confidence: row.confidence })),
      auditTrail: auditTrail.slice(0, 25),
    };
  }

  function exportJson() {
    const payload = exportPayload();
    const cleanPayload = {
      report: { title: "PFI Lumbar MRI - Resumen academico de revision", generatedAt: payload.generatedAt, caseId: payload.caseId, runId: payload.runId, reviewStatus: payload.reviewStatus, scope: payload.governance.scope },
      study: { subjectRef: payload.subjectRef, studyDate: payload.studyDate, plane: payload.plane, modelKey: payload.modelKey, modelVersion: payload.modelVersion },
      traceability: { inferenceMode: payload.inferenceMode, requestedInferenceMode: payload.requestedInferenceMode, modelReadiness: payload.modelReadiness, modelArtifact: payload.modelArtifact, quality: payload.quality },
      summary: payload.summary,
      measurements: payload.measurements,
      auditTrail: payload.auditTrail,
      governance: payload.governance,
      notes: payload.notes,
    };
    downloadTextFile(`${safeFileFragment(displayRun.caseId)}-${safeFileFragment(displayRun.runId)}-review-formatted.json`, JSON.stringify(cleanPayload, null, 2), "application/json;charset=utf-8");
  }

  function exportCsv() {
    const payload = exportPayload();
    const headers = ["Caso", "Run", "Medición", "Nivel", "Valor IA", "Valor Reviewer", "Delta", "Unidad", "Prioridad", "Estado", "Outlier", "Confianza (%)"];
    const rows = payload.measurements.map((row) => [payload.caseId, payload.runId, row.label, row.level, row.aiValue, row.reviewerValue ?? "sin cambios", row.deltaFormatted, row.unit, row.severity, row.status, row.outlier ? "si" : "no", row.confidence !== undefined ? Math.round(row.confidence * 100) : ""]);
    const csv = "\ufeff" + [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    downloadTextFile(`${safeFileFragment(displayRun.caseId)}-${safeFileFragment(displayRun.runId)}-mediciones.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportHtml() {
    const payload = exportPayload();
    const measurementRows = payload.measurements.map((row) => `<tr><td><strong>${escapeHtml(row.label)}</strong><br><span>${escapeHtml(row.level)}</span></td><td>${escapeHtml(row.aiValue)} ${escapeHtml(row.unit)}</td><td>${escapeHtml(row.reviewerValue ?? "sin cambios")}</td><td>${escapeHtml(row.deltaFormatted)}</td><td>${escapeHtml(row.status)}</td><td>${row.outlier ? "Si" : "No"}</td></tr>`).join("");
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>PFI Lumbar MRI - ${escapeHtml(payload.caseId)}</title><style>body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:32px;color:#102033;background:#f8fafc}.report{background:#fff;border:1px solid #d8e6f4;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.08);padding:28px;max-width:1080px;margin:auto}.eyebrow{text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-size:12px;font-weight:800}h1{margin:6px 0 4px;font-size:28px}.muted{color:#64748b}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.card{border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:#f8fbff}.card strong{display:block;font-size:20px;margin-top:4px}table{border-collapse:collapse;width:100%;margin-top:16px}th{background:#eef4fb;text-align:left;font-size:12px;text-transform:uppercase;color:#475569}td,th{border-bottom:1px solid #e2e8f0;padding:12px;vertical-align:top}td span{color:#64748b;font-size:12px}.notice{border:1px solid #bae6fd;background:#f0f9ff;border-radius:14px;padding:12px;margin-top:18px}.footer{font-size:12px;color:#64748b;margin-top:20px}@media print{body{background:#fff;margin:0}.report{box-shadow:none;border:0}}</style></head><body><main class="report"><div class="eyebrow">PFI Lumbar MRI Analysis Platform</div><h1>Resumen academico de revision</h1><p class="muted">Caso ${escapeHtml(payload.caseId)} · Run ${escapeHtml(payload.runId)} · Generado ${escapeHtml(payload.generatedAt)}</p><section class="grid"><div class="card">Estado<strong>${escapeHtml(payload.reviewStatus)}</strong></div><div class="card">Modo<strong>${escapeHtml(payload.inferenceMode)}</strong></div><div class="card">Mediciones<strong>${payload.summary.measurementsTotal}</strong></div><div class="card">Outliers<strong>${payload.summary.outliers}</strong></div></section><section class="notice"><strong>Alcance:</strong> uso academico/investigacion, datos de-identificados, requiere revision profesional y no constituye diagnostico clinico. No incluye imagenes crudas. Readiness: ${escapeHtml(payload.modelReadiness)}.</section><h2>Mediciones IA vs Reviewer</h2><table><thead><tr><th>Medicion</th><th>IA</th><th>Reviewer</th><th>Delta</th><th>Estado</th><th>Outlier</th></tr></thead><tbody>${measurementRows}</tbody></table><h2>Notas</h2><p>${escapeHtml(payload.notes || "Sin notas registradas.")}</p><div class="footer">Subject ref de-identificado: ${escapeHtml(payload.subjectRef)} · Study date: ${escapeHtml(payload.studyDate)} · Modelo: ${escapeHtml(payload.modelKey)}</div></main></body></html>`;
    downloadTextFile(`${safeFileFragment(displayRun.caseId)}-${safeFileFragment(displayRun.runId)}-informe.html`, html, "text/html;charset=utf-8");
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
          <button className={`visibility-toggle ${visible ? "is-visible" : "is-hidden"}`} onClick={() => togglePanel(panelId)} type="button" aria-label={visible ? `Ocultar ${title}` : `Mostrar ${title}`} title={visible ? `Ocultar ${title}` : `Mostrar ${title}`}>
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
        <div>
          <p>Espacio de revisión</p>
          <h1>{displayRun.caseId ?? studyReview?.caseId ?? "CASE-DEMO-0142"}</h1>
        </div>
        <div className="safety-copy">
          <strong>Requiere revisión profesional.</strong>
          <span>Salida asistiva, no diagnóstico clínico.</span>
        </div>
      </section>

      <section className="review-grid">
        <aside className="left-column">
          <article className="panel-card compact-card">
            <PanelTitle panelId="case" title="Información del caso"><ReviewBadge status={review.status ?? "pendiente"} /></PanelTitle>
            {panelVisible("case") ? (
              <dl className="info-list compact-info">
                <div><dt>ID caso</dt><dd>{displayRun.caseId ?? studyReview?.caseId}</dd></div>
                <div><dt>Sujeto ref.</dt><dd>{selectedDetail?.study?.patientId ?? run.patientId ?? studyReview?.patientId ?? "PAT-0087"}</dd></div>
                <div><dt>Fecha estudio</dt><dd>{selectedDetail?.study?.studyDate ?? run.studyDate ?? studyReview?.studyDate ?? "2026-07-01"}</dd></div>
                <div><dt>Plano</dt><dd>{currentSeries?.plane ?? displayRun.plane}</dd></div>
                <div><dt>Modelo</dt><dd>{displayRun.modelKey}</dd></div>
                <div><dt>ID corrida</dt><dd>{displayRun.runId}</dd></div>
              </dl>
            ) : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card">
            <PanelTitle panelId="ai-output" title="Salida módulo IA"><StatusBadge tone={outputTone(aiOutput.status)}>{outputStatusLabel(aiOutput.status)}</StatusBadge></PanelTitle>
            {panelVisible("ai-output") ? (
              <>
                <strong>{aiOutput.label ?? "Contrato de revisión listo"}</strong>
                <p className="muted compact-copy">{aiOutput.description ?? "Workspace visual con datos de-identificados."}</p>
              </>
            ) : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card">
            <PanelTitle panelId="traceability" title="Trazabilidad de corrida"><StatusBadge tone={traceabilityTone(inferenceMode, artifact)}>{inferenceModeLabel(inferenceMode)}</StatusBadge></PanelTitle>
            {panelVisible("traceability") ? (
              <>
                <p className="muted compact-copy">Trazabilidad técnica del análisis recibido desde el módulo IA. Esta salida es asistiva, revisable y no constituye diagnóstico clínico.</p>
                <dl className="info-list compact-info">
                  <div><dt>Modo inferencia</dt><dd>{inferenceModeLabel(inferenceMode)}</dd></div>
                  <div><dt>Modo solicitado</dt><dd>{inferenceModeLabel(requestedInferenceMode)}</dd></div>
                  <div><dt>Modelo</dt><dd>{displayRun.modelKey} · {displayRun.modelVersion ?? modelArtifact?.version ?? "contract-v1"}</dd></div>
                  <div><dt>Estado modelo</dt><dd>{readinessLabel(modelReadiness)}</dd></div>
                  <div><dt>Modelo real disponible</dt><dd>{boolText(artifact?.exists)}</dd></div>
                  <div><dt>Inferencia real</dt><dd>{boolText(realInferenceAvailable)}</dd></div>
                  <div><dt>Mediciones</dt><dd>{quality?.measurementCount ?? resultRows.length}</dd></div>
                  <div><dt>Máscaras</dt><dd>{quality?.maskCount ?? masks.length}</dd></div>
                  <div><dt>Landmarks</dt><dd>{quality?.landmarkCount ?? landmarks.length}</dd></div>
                  <div><dt>Derivadas de contornos</dt><dd>{boolText(quality?.measurementsDerivedFromContours)}</dd></div>
                  <div><dt>Pixel spacing</dt><dd>{quality?.pixelSpacingMm ? `${quality.pixelSpacingMm} mm` : "sin datos"}</dd></div>
                </dl>
                {artifact?.path && <p className="muted compact-copy">Artifact esperado: <code>{artifact.path}</code></p>}
              </>
            ) : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card">
            <PanelTitle panelId="series" title="Series" />
            {panelVisible("series") ? (
              <div className="series-list compact-list">
                {seriesList.map((item: any) => (
                  <button className={`series-item ${currentSeries?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => selectSeries(item)} type="button">
                    <span className="thumbnail" />
                    <span><strong>{item.name}</strong><small>{item.plane} · {item.sliceCount} cortes</small></span>
                  </button>
                ))}
              </div>
            ) : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card">
            <PanelTitle panelId="masks" title="Máscaras" />
            {panelVisible("masks") ? (
              <div className="mask-list compact-mask-list">
                {masks.map((mask: any) => {
                  const visible = maskVisibility[mask.id] ?? mask.enabled ?? true;
                  return (
                    <label className={selectedMask === mask.id ? "selected" : ""} key={mask.id}>
                      <input checked={visible} onChange={() => toggleMask(mask.id)} type="checkbox" />
                      <i style={{ background: mask.color }} />
                      <button onClick={() => setSelectedMask(mask.id)} type="button">{mask.label}</button>
                      <small>{visible ? "visible" : "oculta"}</small>
                    </label>
                  );
                })}
              </div>
            ) : hiddenPlaceholder}
          </article>
        </aside>

        <section className="center-column">
          <div className="workspace-tabs">
            {(["Sagittal", "Axial", "3D Reconstruction"] as const).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} type="button">{item === "3D Reconstruction" ? "Reconstrucción 3D" : item}</button>)}
          </div>
          <div className="toolbar compact-toolbar">
            <button className={editMode ? "active" : ""} onClick={() => setEditMode((value) => !value)} type="button">Editar máscara</button>
            <button onClick={() => setSelectedLandmark("L4-L5")} type="button">Agregar landmark</button>
            <button type="button">Recalcular</button>
            <button className={overlayEnabled ? "active" : ""} onClick={() => setOverlayEnabled((value) => !value)} type="button">Superposición</button>
            <label className="opacity-control">Opacidad <input min="25" max="100" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} type="range" /></label>
          </div>
          <div className="edit-state compact-copy">Serie: <strong>{currentSeries?.name}</strong> · Corte: <strong>{activeSlice}</strong> · Máscara: <strong>{selectedMask}</strong> · Landmark: <strong>{selectedLandmark}</strong></div>
          {tab === "3D Reconstruction" ? (
            <article className="panel-card full-viewer"><SpineReconstructionPreview /></article>
          ) : (
            <div className="viewer-stack compact-viewer-stack">
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
              <article className="panel-card compact-card legend-card">
                <PanelTitle panelId="legend" title="Leyenda" />
                {panelVisible("legend") ? <div className="legend-grid">{masks.map((mask: any) => <span key={mask.id}><i style={{ background: mask.color }} />{mask.label}</span>)}</div> : hiddenPlaceholder}
              </article>
            </div>
          )}
        </section>

        <aside className="right-column">
          <section className="panel-card results-panel">
            <PanelTitle panelId="results" title="Resultados IA y revisión"><StatusBadge tone={outlierCount > 0 ? "red" : relevantChanges > 0 ? "amber" : hasReviewerDrafts ? "amber" : "blue"}>{outlierCount > 0 ? `${outlierCount} outlier` : relevantChanges > 0 ? `${relevantChanges} cambio/s` : hasReviewerDrafts ? "cambios pendientes" : "editable"}</StatusBadge></PanelTitle>
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

          <AgentSummary agentDecision={run.aiOutput?.agentDecision ?? studyReview?.aiOutput?.agentDecision ?? run.agentDecision} />

          <section className="panel-card notes-card compact-card">
            <PanelTitle panelId="decision" title="Notas y decisión" />
            {panelVisible("decision") ? (
              <>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones profesionales de revisión..." />
                <div className="review-actions compact-actions">
                  <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}>
                    <option value="pendiente">pendiente</option>
                    <option value="aceptado">aceptado</option>
                    <option value="observado">observado</option>
                    <option value="descartado">descartado</option>
                  </select>
                  <button className="ghost-button" disabled={saving} onClick={() => void save(reviewStatus)} type="button">Guardar borrador</button>
                  <button className="primary-button" disabled={saving} onClick={() => void save("aceptado")} type="button">Aprobar</button>
                  <button className="warning-button" disabled={saving} onClick={() => void save("observado")} type="button">Observar</button>
                </div>
                <div className="review-actions compact-actions export-actions">
                  <button className="ghost-button" onClick={exportHtml} type="button">Exportar informe</button>
                  <button className="ghost-button" onClick={exportJson} type="button">Exportar JSON</button>
                  <button className="ghost-button" onClick={exportCsv} type="button">Exportar CSV</button>
                </div>
              </>
            ) : hiddenPlaceholder}
          </section>

          <section className="panel-card compact-card collapsible-audit">
            <PanelTitle panelId="audit" title="Auditoría" />
            {panelVisible("audit") ? <AuditTrail events={auditTrail.slice(0, 4)} /> : hiddenPlaceholder}
          </section>
        </aside>
      </section>
      <PrivacyBanner />
    </div>
  );
}
