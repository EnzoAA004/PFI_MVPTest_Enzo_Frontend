import { useEffect, useMemo, useState, type ReactNode } from "react";
import { exportReviewReport } from "../api";
import { resolvePersistedPlaneWorkspace, type PersistedPlaneWorkspace } from "../appDataGuards";
import type { AiModelArtifact, AiRunResponse, AgentQuality, AuditEvent, Measurement, ReviewStatus, ReviewStatusResponse, StudyDetailResponse, StudyLandmark, StudyMask, StudyMetadataInput, StudySeries } from "../appTypes";
import { displayInferenceMode, displayMeasurementLabel, displayMeasurementLevel, displayModality, displayReviewPriority, displayReviewStatus, displayTechnicalReadiness, displayUnit } from "../clinicalDisplay";
import { loadSelectedStudyDetail, SELECTED_STUDY_EVENT } from "../selectedStudyStorage";
import { updateStudyMetadata } from "../studyApi";
import { displayModelKey, displayPrimaryPlane, displayStudyDate, displaySubjectRef } from "../studyDisplay";
import { emptyStudyMetadataDraft, normalizeStudyMetadataInput, priorityToBackend, subjectRefErrorMessage, validateSubjectRef, type StudyMetadataDraft } from "../studyMetadata";
import { studyRunToMriViewerModel } from "../viewModels/mriViewerViewModel";
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
  { id: "mask-vertebral-body", label: "Cuerpo vertebral", className: "vertebral_body", color: "var(--mask-vertebral-body)", confidence: 0.86, editable: true, enabled: true, contours: [] },
  { id: "mask-disc", label: "Disco intervertebral", className: "disc", color: "var(--mask-disc)", confidence: 0.82, editable: true, enabled: true, contours: [] },
  { id: "mask-canal", label: "Canal espinal", className: "spinal_canal", color: "var(--mask-spinal-canal)", confidence: 0.79, editable: true, enabled: true, contours: [] },
  { id: "mask-root-left", label: "Raíz nerviosa izquierda", className: "nerve_root", color: "var(--mask-nerve-root)", confidence: 0.72, editable: true, enabled: true, contours: [] },
  { id: "mask-foramen-right", label: "Foramen derecho", className: "foramen", color: "var(--mask-foramen-other-soft-tissue)", confidence: 0.7, editable: true, enabled: true, contours: [] },
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
type ExportFormat = "json" | "csv" | "html";

interface StudyReviewViewProps {
  run: AiRunResponse;
  studyReview?: any | null;
  measurements: Measurement[];
  auditTrail: AuditEvent[];
  saving: boolean;
  onBackToStudies: () => void;
  onMeasurementsChange: (measurements: Measurement[], detail: string) => void;
  onSaveReview: (status: ReviewStatus, notes: string, measurements: Measurement[]) => Promise<ReviewStatusResponse | undefined>;
  onStudyMetadataUpdated?: (caseId: string) => Promise<void>;
}

function inferenceModeLabel(value?: string) {
  return displayInferenceMode(value);
}

function traceabilityTone(inferenceMode?: string, artifact?: AiModelArtifact) {
  if (inferenceMode === "real" && artifact?.exists) return "green";
  if (inferenceMode === "real_baseline" && artifact?.exists) return "green";
  if (inferenceMode === "contract") return "amber";
  return "blue";
}

function maskTokenVar(mask: StudyMask) {
  const key = `${mask.id} ${mask.className} ${mask.label}`.toLowerCase();
  if (key.includes("disc")) return "var(--mask-disc)";
  if (key.includes("canal") || key.includes("spinal")) return "var(--mask-spinal-canal)";
  if (key.includes("root") || key.includes("raiz") || key.includes("raíz")) return "var(--mask-nerve-root)";
  if (key.includes("foramen") || key.includes("soft")) return "var(--mask-foramen-other-soft-tissue)";
  return "var(--mask-vertebral-body)";
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

function isDemoRun(run: AiRunResponse) {
  return run.dataOrigin === "demo" || run.effectiveInferenceMode === "mock" || run.requestedInferenceMode === "mock";
}

function planeRunRecord(run: AiRunResponse, plane: "sagittal" | "axial") {
  const planes = asRecord(run.planes);
  return asRecord(planes?.[plane]);
}

function seriesFromPlaneRun(run: AiRunResponse, workspace: PersistedPlaneWorkspace): StudySeries | null {
  const planeRun = planeRunRecord(run, workspace.plane);
  const metadata = asRecord(planeRun?.metadata);
  const sliceCount = typeof metadata?.sliceCount === "number" && metadata.sliceCount > 0 ? metadata.sliceCount : 1;
  const selectedSlice = typeof metadata?.selectedSlice === "number" && metadata.selectedSlice >= 0 ? metadata.selectedSlice : 0;
  const coordinateSpace = typeof planeRun?.coordinateSpace === "string"
    ? planeRun.coordinateSpace
    : typeof planeRun?.measurements?.coordinateSpace === "string"
      ? planeRun.measurements.coordinateSpace
      : undefined;
  const assets = {
    ...(workspace.inputUrl ? { "input.png": workspace.inputUrl } : {}),
    ...(workspace.overlayUrl ? { "overlay.png": workspace.overlayUrl } : {}),
    ...(workspace.maskPreviewUrl ? { "mask-preview.png": workspace.maskPreviewUrl } : {}),
  };
  return workspace.planeRunId ? {
    id: `${workspace.planeRunId}-${workspace.plane}`,
    name: workspace.plane === "sagittal" ? "Sagital" : "Axial",
    plane: workspace.plane,
    sliceCount,
    selectedSlice,
    imageUrl: workspace.inputUrl ?? null,
    overlayUrl: workspace.overlayUrl ?? null,
    assets,
    planeRunId: workspace.planeRunId,
    storageStatus: workspace.storageStatus,
    available: workspace.available,
    coordinateSpace,
    status: workspace.available ? "stored" : workspace.storageStatus,
  } : null;
}

function readinessLabel(value?: string) {
  return displayTechnicalReadiness(value);
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
  return `${sign}${delta.toFixed(2)} ${displayUnit(unit)}`;
}

function confidenceToneClass(confidence?: number) {
  if (confidence === undefined) return "confidence-muted";
  if (confidence >= 0.85) return "confidence-high";
  if (confidence >= 0.7) return "confidence-medium";
  return "confidence-low";
}

function coordinateSpaceFrom(series?: any, landmarks?: StudyLandmark[]) {
  const fromSeries = typeof series?.coordinateSpace === "string" ? series.coordinateSpace : undefined;
  const fromLandmark = landmarks?.find((landmark: StudyLandmark) => typeof (landmark as Record<string, unknown>).coordinateSpace === "string") as Record<string, unknown> | undefined;
  return fromSeries ?? (typeof fromLandmark?.coordinateSpace === "string" ? fromLandmark.coordinateSpace : undefined);
}

function normalizeRow(item: any): MeasurementRow {
  const value = item.aiValue ?? item.value ?? "";
  const label =
    typeof item.label === "string" && item.label.trim()
      ? item.label.trim()
      : typeof item.labelKey === "string" && item.labelKey.trim()
        ? item.labelKey.trim()
        : "Medición revisable";
  return {
    id: String(item.id ?? item.labelKey ?? item.label ?? "measurement"),
    label,
    level: String(item.level ?? "Nivel no informado"),
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

function metadataDraftFromDetail(detail: StudyDetailResponse | null, run: AiRunResponse): StudyMetadataDraft {
  const study = detail?.study;
  return {
    subjectRef: study?.subjectRef ?? run.patientId ?? "",
    studyDate: study?.studyDate ?? run.studyDate ?? "",
    modality: study?.modality ?? run.modality ?? "",
    description: study?.description ?? "",
    reviewPriority: priorityToBackend(study?.priority),
  };
}

function metadataPayloadEqual(next: StudyMetadataInput, current: StudyMetadataDraft) {
  const nextSubjectRef = next.subjectRef?.trim().toLowerCase() ?? null;
  const currentSubjectRef = current.subjectRef.trim().toLowerCase() || null;
  return nextSubjectRef === currentSubjectRef
    && next.studyDate === (current.studyDate || null)
    && next.modality === (current.modality || null)
    && next.description === (current.description.trim() || null)
    && next.reviewPriority === current.reviewPriority;
}

export function StudyReviewView({ run, studyReview, measurements, auditTrail, saving, onBackToStudies, onMeasurementsChange, onSaveReview, onStudyMetadataUpdated }: StudyReviewViewProps) {
  const [tab, setTab] = useState<"Sagittal" | "Axial" | "3D Reconstruction">("Sagittal");
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [maskVisibility, setMaskVisibility] = useState<Record<string, boolean>>({});
  const [editMode, setEditMode] = useState(false);
  const [selectedMask, setSelectedMask] = useState("mask-disc");
  const [selectedLandmark, setSelectedLandmark] = useState("L4");
  const [overlayAvailableByPlano, setOverlayAvailableByPlano] = useState<Record<string, boolean>>({});
  const [reviewerValues, setReviewerValues] = useState<Record<string, string>>({});
  const [landmarkDrafts, setLandmarkDrafts] = useState<Record<string, StudyLandmark>>({});
  const [landmarkAddMode, setLandmarkAddMode] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(run.review?.status ?? run.reviewStatus ?? "pendiente");
  const [notes, setNotes] = useState(run.review?.notes ?? run.review?.observations ?? "");
  const [saveMessage, setSaveMessage] = useState("");
  const [hiddenPanels, setHiddenPanels] = useState<Record<string, boolean>>({});
  const [selectedDetail, setSelectedDetail] = useState<StudyDetailResponse | null>(() => loadSelectedStudyDetail());
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState<StudyMetadataDraft>(() => metadataDraftFromDetail(loadSelectedStudyDetail(), run));
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataError, setMetadataError] = useState("");

  useEffect(() => {
    const update = () => setSelectedDetail(loadSelectedStudyDetail());
    window.addEventListener(SELECTED_STUDY_EVENT, update);
    return () => window.removeEventListener(SELECTED_STUDY_EVENT, update);
  }, []);

  useEffect(() => {
    if (!metadataDialogOpen) setMetadataDraft(metadataDraftFromDetail(selectedDetail, run));
  }, [metadataDialogOpen, run.caseId, run.patientId, run.studyDate, run.modality, selectedDetail]);

  useEffect(() => {
    setReviewStatus(run.review?.status ?? run.reviewStatus ?? "pendiente");
    setNotes(run.review?.notes ?? run.review?.observations ?? "");
    setReviewerValues({});
    setLandmarkDrafts({});
    setLandmarkAddMode(false);
    setSaveMessage("");
    setMetadataError("");
    setMetadataDialogOpen(false);
  }, [run.runId, run.review?.status, run.review?.notes, run.review?.observations, run.reviewStatus]);

  const demoMode = isDemoRun(run);
  const displayRun: AiRunResponse = {
    ...run,
    caseId: selectedDetail?.study?.caseId ?? run.caseId,
    plane: run.plane ?? selectedDetail?.study?.plane ?? selectedDetail?.study?.primaryPlane ?? undefined,
    modelKey: run.modelKey ?? selectedDetail?.study?.modelKey ?? undefined,
    review: run.review ?? selectedDetail?.review,
  };

  const sagittalWorkspace = useMemo(() => resolvePersistedPlaneWorkspace(displayRun, "sagittal"), [displayRun]);
  const axialWorkspace = useMemo(() => resolvePersistedPlaneWorkspace(displayRun, "axial"), [displayRun]);
  const persistedSeries = useMemo(() => [seriesFromPlaneRun(displayRun, sagittalWorkspace), seriesFromPlaneRun(displayRun, axialWorkspace)].filter((item): item is StudySeries => Boolean(item)), [axialWorkspace, displayRun, sagittalWorkspace]);
  const hasPipelineVisualContract = demoMode && Array.isArray(run.series) && run.series.length > 0;
  const pipelineMeasurements = hasPipelineVisualContract && Array.isArray(run.normalizedMeasurements) ? run.normalizedMeasurements : [];
  const persistedMeasurements = sagittalWorkspace.measurements.length ? sagittalWorkspace.measurements : axialWorkspace.measurements;
  const sourceMeasurements = persistedMeasurements.length ? persistedMeasurements : selectedDetail?.measurements?.length ? selectedDetail.measurements : pipelineMeasurements.length ? pipelineMeasurements : measurements;
  const review = useMemo(() => displayRun.review ?? { status: run.reviewStatus ?? "pendiente" as ReviewStatus }, [displayRun.review, run.reviewStatus]);
  const seriesList = persistedSeries.length ? persistedSeries : demoMode ? hasPipelineVisualContract ? run.series ?? fallbackSeries : Array.isArray(studyReview?.series) && studyReview.series.length ? studyReview.series : fallbackSeries : [];
  const masks = demoMode ? hasPipelineVisualContract && Array.isArray(run.masks) ? run.masks : Array.isArray(studyReview?.masks) && studyReview.masks.length ? studyReview.masks : fallbackMasks : Array.isArray(run.masks) ? run.masks : [];
  const landmarks: StudyLandmark[] = demoMode ? hasPipelineVisualContract && Array.isArray(run.landmarks) ? run.landmarks : Array.isArray(studyReview?.landmarks) ? studyReview.landmarks : [] : Array.isArray(run.landmarks) ? run.landmarks : [];
  const displayLandmarks = useMemo(() => {
    const byId = new Map<string, StudyLandmark>();
    landmarks.forEach((landmark) => byId.set(landmark.id, landmark));
    Object.values(landmarkDrafts).forEach((landmark) => byId.set(landmark.id, landmark));
    return Array.from(byId.values());
  }, [landmarkDrafts, landmarks]);
  const aiOutput = hasPipelineVisualContract && run.aiOutput ? run.aiOutput : studyReview?.aiOutput ?? {
    status: run.measurementsStatus ?? "ai_output_pending",
    label: run.measurementsStatus === "pending_real_inference" ? "Salida IA pendiente" : "Salida técnica",
    description: run.measurementsDescription ?? "Pipeline técnico preparado para recibir inferencia real.",
  };
  const currentSeries = seriesList.find((item: any) => item.id === selectedSeriesId) ?? seriesList.find((item: any) => item.plane === tab.toLowerCase()) ?? seriesList[0];
  const activePlano = currentSeries?.plane === "axial" ? "axial" : "sagittal";
  const activeWorkspace = activePlano === "axial" ? axialWorkspace : sagittalWorkspace;
  const overlayAvailable = overlayAvailableByPlano[activePlano] === true;
  const activeCoordinateSpace = coordinateSpaceFrom(currentSeries, displayLandmarks);
  const viewerModel = useMemo(
    () => studyRunToMriViewerModel({
      plane: activePlano,
      planeRunId: activeWorkspace.planeRunId ?? undefined,
      series: currentSeries ?? undefined,
      masks,
      landmarks: displayLandmarks,
    }),
    [activePlano, activeWorkspace.planeRunId, currentSeries, masks, displayLandmarks],
  );

  const studyMeasurements: MeasurementRow[] = hasPipelineVisualContract && pipelineMeasurements.length
    ? pipelineMeasurements.map((item) => normalizeRow({ ...item, aiValue: item.aiValue ?? item.value, reviewerValue: item.reviewerValue ?? null, confidence: item.confidence ?? 0.72 }))
    : Array.isArray(studyReview?.measurements) && studyReview.measurements.length
      ? studyReview.measurements.map((item: any) => normalizeRow(item))
      : sourceMeasurements.map((item) => normalizeRow({ ...item, aiValue: item.aiValue ?? item.value, reviewerValue: item.source === "Reviewer" ? item.value : item.reviewerValue ?? null, confidence: item.confidence ?? 0.72 }));

  const metadata = asRecord(run.metadata);
  const modelArtifact = run.modelArtifact;
  const artifact = artifactFrom(run);
  const quality = qualityFrom(run);
  const activePlaneRun = planeRunRecord(displayRun, activePlano);
  const inferenceMode = displayRun.effectiveInferenceMode ?? String(activePlaneRun?.effectiveInferenceMode ?? activePlaneRun?.inferenceMode ?? aiOutput.inferenceMode ?? displayRun.requestedInferenceMode ?? metadata?.inferenceMode ?? "sin datos");
  const requestedInferenceMode = displayRun.requestedInferenceMode ?? aiOutput.requestedInferenceMode ?? String(activePlaneRun?.requestedInferenceMode ?? metadata?.requestedInferenceMode ?? metadata?.inferenceMode ?? "sin datos");
  const modelReadiness = aiOutput.modelReadiness ?? modelArtifact?.readiness ?? String(metadata?.modelReadiness ?? "sin datos");
  const selectedStudyRecord = asRecord(selectedDetail?.study);
  const patientSafe = asRecord(selectedStudyRecord?.metadata) ?? asRecord(studyReview?.patientSafeMetadata) ?? asRecord(metadata?.patientSafeMetadata) ?? {};
  const reviewerName = displayRun.review?.reviewer ?? run.review?.reviewer ?? "Revisor";
  const futureFeatureTitle = "Disponible en una fase futura";
  const currentMetadataDraft = metadataDraftFromDetail(selectedDetail, run);
  const currentSubjectRef = currentMetadataDraft.subjectRef.trim();
  const subjectRefLocked = Boolean(currentSubjectRef);

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
    const hasPersistedReviewerValue = persistedValue !== undefined && persistedValue !== null && persistedValue !== "";
    const status = draftValue !== undefined && draftValue !== "" ? "draft" : hasPersistedReviewerValue ? "guardado" : item.status ?? "pendiente";
    return { ...item, reviewerValue, draftValue, persistedValue, delta, severity, status };
  }).sort((a, b) => {
    const outlierDiff = Number(Boolean(b.outlier)) - Number(Boolean(a.outlier));
    if (outlierDiff !== 0) return outlierDiff;
    const severityDiff = severityWeight(b.severity) - severityWeight(a.severity);
    if (severityDiff !== 0) return severityDiff;
    return String(a.label).localeCompare(String(b.label));
  }), [reviewerValues, sourceMeasurements, studyMeasurements]);

  const hasMeasurementDrafts = Object.keys(reviewerValues).some((key) => reviewerValues[key] !== "");
  const reviewerDraftCount = Object.keys(reviewerValues).filter((key) => reviewerValues[key] !== "").length;
  const landmarkDraftCount = Object.keys(landmarkDrafts).length;
  const hasReviewerDrafts = hasMeasurementDrafts || landmarkDraftCount > 0;
  const relevantChanges = resultRows.filter((row) => row.severity === "medium" || row.severity === "high").length;
  const outlierCount = resultRows.filter((row) => row.outlier).length;
  const confirmDisabled = saving || reviewStatus === "pendiente";

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

  function resetReviewerValue(measurementId: string) {
    const row = resultRows.find((item) => item.id === measurementId);
    if (row?.persistedValue !== "" && row?.aiValue !== undefined && row.aiValue !== null) {
      setReviewerValues((current) => ({ ...current, [measurementId]: String(row.aiValue) }));
      return;
    }
    setReviewerValues((current) => {
      const next = { ...current };
      delete next[measurementId];
      return next;
    });
  }

  function updateLandmarkDraft(landmark: StudyLandmark) {
    setLandmarkDrafts((current) => ({ ...current, [landmark.id]: landmark }));
    setSelectedLandmark(landmark.id);
  }

  function resetReviewerDrafts() {
    setReviewerValues({});
    setLandmarkDrafts({});
    setLandmarkAddMode(false);
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
      forceCorrection: reviewerValue !== undefined && reviewerValue !== "",
    };
  }

  function currentReviewerMeasurements() {
    const existingIds = new Set(sourceMeasurements.map((item) => item.id));
    const updated = sourceMeasurements.map((item) => {
      const reviewerValue = reviewerValues[item.id];
      return reviewerValue !== undefined && reviewerValue !== "" ? { ...item, value: reviewerValue, reviewerValue, source: "Reviewer" as const, status: "editado" as const, forceCorrection: true } : item;
    });
    const appended = studyMeasurements
      .filter((item) => reviewerValues[item.id] !== undefined && reviewerValues[item.id] !== "" && !existingIds.has(item.id))
      .map(toMeasurement);
    return [...updated, ...appended];
  }

  function commitReviewerMeasurements() {
    if (!hasMeasurementDrafts) return sourceMeasurements;
    const nextMeasurements = currentReviewerMeasurements();
    onMeasurementsChange(nextMeasurements, `${reviewerDraftCount} corrección/es confirmadas por backend`);
    setReviewerValues({});
    return nextMeasurements;
  }

  function exportPayload() {
    const reviewed = resultRows.filter((row) => row.reviewerValue !== null && row.reviewerValue !== "").length;
    return {
      exportType: "academic_deidentified_review",
      generatedAt: new Date().toISOString(),
      caseId: displayRun.caseId,
      subjectRef: displaySubjectRef(selectedDetail?.study?.subjectRef ?? run.patientId ?? studyReview?.patientId ?? null),
      studyDate: displayStudyDate(selectedDetail?.study?.studyDate ?? run.studyDate ?? studyReview?.studyDate ?? null),
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
      reviewStatusLabel: displayReviewStatus(reviewStatus),
      notes,
      summary: { measurementsTotal: resultRows.length, measurementsReviewed: reviewed, outliers: outlierCount, relevantChanges, reviewerDrafts: reviewerDraftCount },
      governance: { scope: "academic/research only", deidentified: true, rawImagesIncluded: false, humanReviewRequired: true, notClinicalDiagnosis: true },
      measurements: resultRows.map((row) => ({ id: row.id, label: displayMeasurementLabel(row.label), technicalLabel: row.label, level: displayMeasurementLevel(row.level), aiValue: row.aiValue, reviewerValue: row.reviewerValue || null, delta: row.delta, deltaFormatted: formatDelta(row.delta, row.unit), unit: row.unit, unitLabel: displayUnit(row.unit), severity: row.severity, status: row.status, outlier: Boolean(row.outlier), confidence: row.confidence })),
      auditTrail: auditTrail.slice(0, 25),
    };
  }

  function backendExportPayload(format: ExportFormat) {
    const payload = exportPayload();
    return {
      format,
      caseId: payload.caseId,
      subjectRef: payload.subjectRef,
      studyDate: payload.studyDate,
      plane: payload.plane,
      modelKey: payload.modelKey,
      modelVersion: payload.modelVersion,
      inferenceMode: payload.inferenceMode,
      modelReadiness: payload.modelReadiness,
      notes: payload.notes,
      measurements: resultRows.map((row) => ({
        id: row.id,
        label: `${row.label}${row.level ? ` ${row.level}` : ""}`,
        value: row.reviewerValue || row.aiValue,
        aiValue: row.aiValue,
        reviewerValue: row.reviewerValue || null,
        unit: row.unit,
        confidence: row.confidence,
        plane: displayRun.plane,
        source: row.reviewerValue ? "Reviewer" : "AI",
        status: row.status === "draft" ? "pendiente" : row.status,
        outlier: Boolean(row.outlier),
      })) as Measurement[],
    };
  }

  async function tryBackendExport(format: ExportFormat) {
    const runId = displayRun.runId ?? "local-run";
    const response = await exportReviewReport(runId, backendExportPayload(format));
    downloadTextFile(response.fileName, response.content, response.mimeType);
  }

  async function exportJson() {
    try { await tryBackendExport("json"); return; } catch { /* local fallback */ }
    const payload = exportPayload();
    const cleanPayload = {
      report: { title: "RM lumbar PFI - Resumen académico de revisión", generatedAt: payload.generatedAt, caseId: payload.caseId, runId: payload.runId, reviewStatus: payload.reviewStatus, scope: payload.governance.scope },
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

  async function exportCsv() {
    try { await tryBackendExport("csv"); return; } catch { /* local fallback */ }
    const payload = exportPayload();
    const headers = ["Caso", "Corrida", "Medición", "Nivel", "Valor IA", "Valor revisor", "Delta", "Unidad", "Prioridad", "Estado", "Atípico", "Confianza (%)"];
    const rows = payload.measurements.map((row) => [payload.caseId, payload.runId, row.label, row.level, row.aiValue, row.reviewerValue ?? "sin cambios", row.deltaFormatted, row.unit, row.severity, row.status, row.outlier ? "si" : "no", row.confidence !== undefined ? Math.round(row.confidence * 100) : ""]);
    const csv = "\ufeff" + [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    downloadTextFile(`${safeFileFragment(displayRun.caseId)}-${safeFileFragment(displayRun.runId)}-mediciones.csv`, csv, "text/csv;charset=utf-8");
  }

  async function exportHtml() {
    try { await tryBackendExport("html"); return; } catch { /* local fallback */ }
    const payload = exportPayload();
    const measurementRows = payload.measurements.map((row) => `<tr><td><strong>${escapeHtml(row.label)}</strong><br><span>${escapeHtml(row.level)}</span></td><td>${escapeHtml(row.aiValue)} ${escapeHtml(row.unit)}</td><td>${escapeHtml(row.reviewerValue ?? "sin cambios")}</td><td>${escapeHtml(row.deltaFormatted)}</td><td>${escapeHtml(row.status)}</td><td>${row.outlier ? "Si" : "No"}</td></tr>`).join("");
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>RM lumbar PFI - ${escapeHtml(payload.caseId)}</title><style>body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:32px;color:#102033;background:#f8fafc}.report{background:#fff;border:1px solid #d8e6f4;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.08);padding:28px;max-width:1080px;margin:auto}.eyebrow{text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-size:12px;font-weight:800}h1{margin:6px 0 4px;font-size:28px}.muted{color:#64748b}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.card{border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:#f8fbff}.card strong{display:block;font-size:20px;margin-top:4px}table{border-collapse:collapse;width:100%;margin-top:16px}th{background:#eef4fb;text-align:left;font-size:12px;text-transform:uppercase;color:#475569}td,th{border-bottom:1px solid #e2e8f0;padding:12px;vertical-align:top}td span{color:#64748b;font-size:12px}.notice{border:1px solid #bae6fd;background:#f0f9ff;border-radius:14px;padding:12px;margin-top:18px}.footer{font-size:12px;color:#64748b;margin-top:20px}@media print{body{background:#fff;margin:0}.report{box-shadow:none;border:0}}</style></head><body><main class="report"><div class="eyebrow">Plataforma de análisis de RM lumbar PFI</div><h1>Resumen académico de revisión</h1><p class="muted">Caso ${escapeHtml(payload.caseId)} · Corrida ${escapeHtml(payload.runId)} · Generado ${escapeHtml(payload.generatedAt)}</p><section class="grid"><div class="card">Estado<strong>${escapeHtml(payload.reviewStatusLabel)}</strong></div><div class="card">Modo<strong>${escapeHtml(payload.inferenceMode)}</strong></div><div class="card">Mediciones<strong>${payload.summary.measurementsTotal}</strong></div><div class="card">Atípicos<strong>${payload.summary.outliers}</strong></div></section><section class="notice"><strong>Alcance:</strong> uso académico/investigación, datos de-identificados, requiere revisión profesional y no constituye diagnóstico clínico. No incluye imágenes crudas. Preparación: ${escapeHtml(payload.modelReadiness)}.</section><h2>Mediciones IA vs revisor</h2><table><thead><tr><th>Medición</th><th>IA</th><th>Revisor</th><th>Delta</th><th>Estado</th><th>Atípico</th></tr></thead><tbody>${measurementRows}</tbody></table><h2>Notas</h2><p>${escapeHtml(payload.notes || "Sin notas registradas.")}</p><div class="footer">Referencia de sujeto deidentificada: ${escapeHtml(payload.subjectRef)} · Fecha de estudio: ${escapeHtml(payload.studyDate)} · Modelo: ${escapeHtml(payload.modelKey)}</div></main></body></html>`;
    downloadTextFile(`${safeFileFragment(displayRun.caseId)}-${safeFileFragment(displayRun.runId)}-informe.html`, html, "text/html;charset=utf-8");
  }

  async function save(status: ReviewStatus) {
    const nextMeasurements = currentReviewerMeasurements();
    const review = await onSaveReview(status, notes, nextMeasurements);
    if (!review) return;
    if (hasMeasurementDrafts) commitReviewerMeasurements();
    setSaveMessage(status === "pendiente" ? "Borrador guardado correctamente" : status === "observado" ? "Estudio marcado como observado." : status === "aceptado" ? "Estudio finalizado y aprobado por el revisor." : "Estudio descartado por el revisor.");
  }

  async function saveStudyMetadata() {
    const caseId = displayRun.caseId ?? selectedDetail?.study?.caseId;
    if (!caseId) {
      setMetadataError("No hay ID de caso para actualizar metadata.");
      return;
    }
    const subjectError = validateSubjectRef(metadataDraft.subjectRef);
    if (subjectError) {
      setMetadataError(subjectRefErrorMessage);
      return;
    }
    const payload = normalizeStudyMetadataInput(metadataDraft);
    if (subjectRefLocked) {
      const nextSubjectKey = payload.subjectRef?.trim().toLowerCase() ?? "";
      const currentSubjectKey = currentSubjectRef.toLowerCase();
      if (nextSubjectKey && nextSubjectKey !== currentSubjectKey) {
        payload.subjectRef = currentSubjectRef;
        if (metadataPayloadEqual(payload, currentMetadataDraft)) {
          setMetadataError("La referencia de-identificada ya fue asignada y no puede reemplazarse.");
          return;
        }
      } else {
        payload.subjectRef = currentSubjectRef;
      }
    }
    if (metadataPayloadEqual(payload, currentMetadataDraft)) {
      setMetadataError("No hay cambios para guardar.");
      return;
    }
    setMetadataSaving(true);
    setMetadataError("");
    try {
      const detail = await updateStudyMetadata(caseId, payload);
      setSelectedDetail(detail);
      await onStudyMetadataUpdated?.(caseId);
      setMetadataDialogOpen(false);
      setSaveMessage("Metadata del estudio actualizada.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudo actualizar la metadata.";
      const traceId = typeof error === "object" && error && "traceId" in error ? String((error as Record<string, unknown>).traceId ?? "") : "";
      setMetadataError(traceId ? `${detail} Trace ${traceId}` : detail);
    } finally {
      setMetadataSaving(false);
    }
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
          <button className="back-link" onClick={onBackToStudies} type="button">← Volver a estudios</button>
          <div className="case-title-row">
            <h1>{displayRun.caseId ?? studyReview?.caseId ?? "Caso sin identificador"}</h1>
            <ReviewBadge status={review.status ?? "pendiente"} />
            <button className="icon-button" aria-label="Más acciones del caso" title="Más acciones del caso" type="button">⋯</button>
          </div>
          <div className="review-mode-row">
            <StatusBadge tone={traceabilityTone(inferenceMode, artifact)}>{inferenceModeLabel(inferenceMode)}</StatusBadge>
            <StatusBadge tone="amber">Revisión humana requerida</StatusBadge>
            <StatusBadge tone="purple">La salida IA puede ser inexacta</StatusBadge>
          </div>
        </div>
        <div className="safety-copy">
          <strong>Requiere revisión profesional.</strong>
          <span>Salida asistiva, no diagnóstico clínico.</span>
        </div>
      </section>

      {metadataDialogOpen && (
        <div className="metadata-dialog-backdrop" role="presentation">
          <section className="metadata-dialog panel-card compact-card" role="dialog" aria-modal="true" aria-labelledby="metadata-dialog-title">
            <div className="section-title">
              <div>
                <h2 id="metadata-dialog-title">Editar metadata del estudio</h2>
                <p className="muted compact-copy">Uso académico con datos de-identificados.</p>
              </div>
              <button className="icon-button" onClick={() => setMetadataDialogOpen(false)} disabled={metadataSaving} type="button" aria-label="Cerrar edición de metadata">×</button>
            </div>
            <div className="settings-form-grid">
              <label>
                <span>Referencia de paciente de-identificada</span>
                <input
                  value={subjectRefLocked ? currentSubjectRef : metadataDraft.subjectRef}
                  readOnly={subjectRefLocked}
                  onBlur={() => setMetadataError(subjectRefLocked ? "" : validateSubjectRef(metadataDraft.subjectRef) ?? "")}
                  onChange={(event) => {
                    if (subjectRefLocked) return;
                    setMetadataDraft((current) => ({ ...current, subjectRef: event.target.value }));
                    setMetadataError("");
                  }}
                  placeholder="SPIDER-101"
                  aria-invalid={Boolean(metadataError)}
                />
              </label>
              {subjectRefLocked && <p className="settings-persistence-note form-span-all">La referencia de-identificada ya fue asignada y no puede reemplazarse. Esto evita vincular estudios de personas distintas.</p>}
              <label>
                <span>Fecha del estudio</span>
                <input type="date" value={metadataDraft.studyDate} onChange={(event) => setMetadataDraft((current) => ({ ...current, studyDate: event.target.value }))} />
              </label>
              <label>
                <span>Modalidad</span>
                <select value={metadataDraft.modality} onChange={(event) => setMetadataDraft((current) => ({ ...current, modality: event.target.value }))}>
                  <option value="">No informada</option>
                  <option value="MRI">Resonancia magnética</option>
                </select>
              </label>
              <label>
                <span>Prioridad</span>
                <select value={metadataDraft.reviewPriority} onChange={(event) => setMetadataDraft((current) => ({ ...current, reviewPriority: event.target.value as StudyMetadataDraft["reviewPriority"] }))}>
                  <option value="low">{displayReviewPriority("low")}</option>
                  <option value="medium">{displayReviewPriority("medium")}</option>
                  <option value="high">{displayReviewPriority("high")}</option>
                </select>
              </label>
              <label className="form-span-all">
                <span>Descripción</span>
                <input maxLength={200} value={metadataDraft.description} onChange={(event) => setMetadataDraft((current) => ({ ...current, description: event.target.value }))} placeholder="RM lumbar sagital T2" />
              </label>
            </div>
            <p className="settings-persistence-note">No ingreses nombre, DNI, correo, teléfono, domicilio ni historia clínica real.</p>
            {metadataError && <div className="toast error" role="alert">{metadataError}</div>}
            <div className="analysis-actions">
              <button className="ghost-button" onClick={() => setMetadataDialogOpen(false)} disabled={metadataSaving} type="button">Cancelar</button>
              <button className="primary-button" onClick={() => void saveStudyMetadata()} disabled={metadataSaving} type="button">{metadataSaving ? "Guardando..." : "Guardar metadata"}</button>
            </div>
          </section>
        </div>
      )}

      <section className="review-grid">
        <aside className="left-column case-review-left">
          <article className="panel-card compact-card">
            <PanelTitle panelId="case-summary" title="Información del caso"><button className="inline-edit-button" onClick={() => setMetadataDialogOpen(true)} type="button">Editar</button></PanelTitle>
            {panelVisible("case-summary") ? (
              <dl className="info-list compact-info">
                <div><dt>ID de caso</dt><dd>{displayRun.caseId ?? studyReview?.caseId}</dd></div>
                <div><dt>Fecha de estudio</dt><dd>{displayStudyDate(selectedDetail?.study?.studyDate ?? run.studyDate ?? studyReview?.studyDate ?? null)}</dd></div>
                <div><dt>Modalidad</dt><dd>{displayModality(selectedDetail?.study?.modality ?? run.modality ?? null)}</dd></div>
                <div><dt>Referencia de paciente de-identificada</dt><dd>{displaySubjectRef(selectedDetail?.study?.subjectRef ?? run.patientId ?? null)}</dd></div>
                <div><dt>Descripción</dt><dd>{selectedDetail?.study?.description ?? "No informada"}</dd></div>
                <div><dt>Plano</dt><dd>{displayPrimaryPlane(currentSeries?.plane ?? displayRun.plane ?? null)}</dd></div>
                <div><dt>Versión del modelo</dt><dd>{displayRun.modelVersion ?? modelArtifact?.version ?? displayModelKey(displayRun.modelKey)}</dd></div>
                <div><dt>Estado de revisión</dt><dd><ReviewBadge status={review.status ?? "pendiente"} />{(review.status ?? "pendiente") === "aceptado" && <small>Finalizado · aprobado por revisor</small>}</dd></div>
                <div><dt>Prioridad</dt><dd>{displayReviewPriority(selectedDetail?.study?.priority ?? null)}</dd></div>
                <div><dt>Revisor</dt><dd>{reviewerName}</dd></div>
              </dl>
            ) : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card">
            <PanelTitle panelId="patient-safe" title="Metadatos deidentificados" />
            {panelVisible("patient-safe") ? (
              <>
                <dl className="info-list compact-info">
                  <div><dt>Edad al estudio</dt><dd>{String(patientSafe.ageAtStudy ?? patientSafe.age ?? "Desconocido")}</dd></div>
                  <div><dt>Sexo</dt><dd>{String(patientSafe.sex ?? "Desconocido")}</dd></div>
                  <div><dt>Región corporal</dt><dd>{String(patientSafe.bodyRegion ?? "No informado")}</dd></div>
                  <div><dt>Descripción</dt><dd>{String(patientSafe.studyDescription ?? "No informado")}</dd></div>
                  <div><dt>Planos disponibles</dt><dd>{seriesList.length ? `${seriesList.length} plano${seriesList.length === 1 ? "" : "s"}` : "No informado"}</dd></div>
                  <div><dt>Resolución de imagen</dt><dd>{String(patientSafe.imageResolution ?? (quality?.pixelSpacingMm ? `${quality.pixelSpacingMm} mm de espaciado` : "sin datos"))}</dd></div>
                </dl>
                <button className="text-link-button" type="button">Show more</button>
              </>
            ) : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card">
            <PanelTitle panelId="series-nav" title="Navegador de series"><span className="muted">{seriesList.length ? `${seriesList.length} plano${seriesList.length === 1 ? "" : "s"}` : "sin planos persistidos"}</span></PanelTitle>
            {panelVisible("series-nav") ? (
              <div className="series-list compact-list">
                {seriesList.length ? seriesList.map((item: any, index: number) => (
                  <button className={`series-item ${currentSeries?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => selectSeries(item)} type="button">
                    <span className="thumbnail neutral-thumbnail" aria-hidden="true"><em>{String(index + 1).padStart(2, "0")}</em></span>
                    <span><strong>{item.name}</strong><small>{item.available ? "input.png persistido" : `asset ${item.storageStatus ?? "no disponible"}`}</small></span>
                  </button>
                )) : <div className="panel-hidden-placeholder">El estudio no declara planos persistidos revisables.</div>}
              </div>
            ) : hiddenPlaceholder}
          </article>

          <article className="panel-card compact-card inference-card">
            <PanelTitle panelId="inference" title="Modo de inferencia"><StatusBadge tone={traceabilityTone(inferenceMode, artifact)}>{inferenceModeLabel(inferenceMode)}</StatusBadge></PanelTitle>
            {panelVisible("inference") ? (
              <dl className="info-list compact-info">
                <div><dt>Solicitado</dt><dd>{inferenceModeLabel(requestedInferenceMode)}</dd></div>
                <div><dt>Preparación</dt><dd>{readinessLabel(modelReadiness)}</dd></div>
                <div><dt>Revisión humana</dt><dd>Requerida</dd></div>
                <div><dt>Uso clínico</dt><dd>No apto para diagnóstico</dd></div>
              </dl>
            ) : hiddenPlaceholder}
          </article>
        </aside>

        <section className="center-column">
          <div className="workspace-tabs">
            {(["Sagittal", "Axial", "3D Reconstruction"] as const).map((item) => {
              const disabled = item === "Axial" ? !axialWorkspace.available : item === "3D Reconstruction" ? displayRun.threeD?.status === "blocked_missing_axial" || displayRun.threeD?.enabled === false : !sagittalWorkspace.planeRunId;
              return <button aria-disabled={disabled} className={tab === item ? "active" : ""} disabled={disabled} key={item} onClick={() => setTab(item)} title={disabled ? item === "Axial" ? "Axial opcional no disponible para esta revisión sagital." : item === "3D Reconstruction" ? "3D paciente-específico bloqueado: falta axial real." : "Sagital persistido no disponible." : undefined} type="button">{item === "3D Reconstruction" ? "Reconstrucción 3D" : item === "Sagittal" ? "Sagital" : "Axial"}</button>;
            })}
          </div>
          <div className="toolbar compact-toolbar review-toolbar" role="toolbar" aria-label="Herramientas de revisión">
            <button disabled title={futureFeatureTitle} type="button">Editar máscara</button>
            <button className={editMode ? "active" : ""} disabled={!activeCoordinateSpace} onClick={() => {
              setEditMode((value) => !value);
              setLandmarkAddMode(false);
            }} title={activeCoordinateSpace ? "Habilita mover landmarks IA como borrador del revisor" : "Espacio de coordenadas no informado por backend"} type="button">Editar landmark</button>
            <button className={landmarkAddMode ? "active" : ""} disabled={!editMode || !activeCoordinateSpace} onClick={() => setLandmarkAddMode((value) => !value)} title={!activeCoordinateSpace ? "Espacio de coordenadas no informado por backend" : editMode ? "Clic sobre la imagen real para agregar landmark del revisor" : "Activar Editar landmark primero"} type="button">Agregar landmark</button>
            <button disabled title={futureFeatureTitle} type="button">Recalcular</button>
            <button disabled={!hasReviewerDrafts} onClick={resetReviewerDrafts} title={hasReviewerDrafts ? "Descartar borradores del revisor" : "No hay borradores del revisor"} type="button">Deshacer</button>
          </div>
          <div className="edit-state compact-copy">Plano: <strong>{currentSeries?.name ?? "sin plano persistido"}</strong> · Run de plano: <strong>{activeWorkspace.planeRunId ?? "no informado"}</strong> · Storage: <strong>{activeWorkspace.storageStatus}</strong> · Superposición: <strong>{overlayAvailable ? "overlay.png real" : activeWorkspace.overlayUrl ? "verificando overlay.png" : "no disponible"}</strong> · Borradores del revisor: <strong>{reviewerDraftCount} medición/es, {landmarkDraftCount} landmark/s</strong> · Landmarks: <strong>no persistido - pendiente BE-008/FE-010 + AI-011</strong></div>
          {tab === "3D Reconstruction" ? (
            <article className="panel-card full-viewer"><SpineReconstructionPreview threeD={displayRun.threeD} /></article>
          ) : (
            <div className="viewer-stack compact-viewer-stack">
              <MriSliceViewer
                model={viewerModel}
                selectedLandmarkId={selectedLandmark}
                onSelectLandmark={setSelectedLandmark}
                readonly={!editMode}
                addMode={landmarkAddMode}
                onMoveLandmark={(landmarkId, point) => {
                  const landmark = displayLandmarks.find((item) => item.id === landmarkId);
                  if (!landmark) return;
                  updateLandmarkDraft({ ...landmark, x: point.x, y: point.y, editable: true });
                }}
                onAddLandmark={(point) => {
                  const landmark: StudyLandmark = {
                    id: `reviewer-landmark-${Date.now()}`,
                    label: `R${displayLandmarks.length + 1}`,
                    seriesId: currentSeries?.id ?? `${activePlano}-asset`,
                    sliceIndex: currentSeries?.selectedSlice ?? 1,
                    x: point.x,
                    y: point.y,
                    editable: true,
                  };
                  updateLandmarkDraft(landmark);
                }}
                onLandmarkAddComplete={() => setLandmarkAddMode(false)}
                overlayEnabled
                onOverlayAvailableChange={(available) => setOverlayAvailableByPlano((current) => ({ ...current, [activePlano]: available }))}
              />
              <article className="panel-card compact-card legend-card">
                <PanelTitle panelId="legend" title="Leyenda" />
                {panelVisible("legend") ? (
                  <>
                    <div className="legend-grid layer-legend-grid">
                      {masks.length ? masks.map((mask: any) => (
                        <button disabled key={mask.id} title="Requiere máscaras por clase desde backend (FE-007/AI-017); hoy solo hay overlay.png combinado." type="button">
                          <i style={{ background: maskTokenVar(mask) }} />{mask.label}
                        </button>
                      )) : <button disabled title="El backend declaró overlay.png combinado, sin máscaras por clase persistidas." type="button"><i style={{ background: "var(--mask-disc)" }} />Superposición combinada</button>}
                    </div>
                    <p className="viewer-limit-note">{masks.length ? "La visibilidad por clase requiere máscaras por clase desde backend. El visor actual usa overlay.png combinado cuando está disponible." : "No hay máscaras por clase persistidas; se muestra solo la superposición combinada si overlay.png está disponible."}</p>
                  </>
                ) : hiddenPlaceholder}
              </article>
            </div>
          )}
        </section>

        <aside className="right-column">
          <section className="panel-card notes-card compact-card decision-panel">
            <PanelTitle panelId="decision-visible" title="Notas" />
            {panelVisible("decision-visible") ? (
              <>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Agregar notas sobre mediciones o hallazgos..." />
                <div className="review-actions compact-actions decision-actions">
                  <label className="decision-status-field">
                    <span>Estado de revisión</span>
                    <select aria-label="Estado de revisión" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}>
                      <option value="pendiente">Pendiente</option>
                      <option value="observado">Observado</option>
                      <option value="aceptado">Finalizado</option>
                      <option value="descartado">Descartado</option>
                    </select>
                  </label>
                  <button className="ghost-button" disabled={saving} onClick={() => void save("pendiente")} type="button">Guardar borrador</button>
                  <button className="primary-button" disabled={confirmDisabled} onClick={() => void save(reviewStatus)} title={reviewStatus === "pendiente" ? "Usá Guardar borrador para conservar una revisión pendiente." : undefined} type="button">Confirmar estado</button>
                  {reviewStatus === "pendiente" && <p className="viewer-limit-note decision-help">Usá Guardar borrador para conservar una revisión pendiente.</p>}
                  {saveMessage && <p className="review-save-result" role="status">{saveMessage}</p>}
                </div>
              </>
            ) : hiddenPlaceholder}
          </section>

          <AgentSummary agentDecision={run.aiOutput?.agentDecision ?? studyReview?.aiOutput?.agentDecision ?? run.agentDecision} />

          <section className="panel-card compact-card collapsible-audit">
            <PanelTitle panelId="audit" title="Auditoría" />
            {panelVisible("audit") ? <AuditTrail events={auditTrail.slice(0, 4)} /> : hiddenPlaceholder}
          </section>
        </aside>

        <section className="panel-card results-panel measurements-review-panel measurements-wide-panel">
          <div className="section-title">
            <h2>Mediciones</h2>
            <button className="text-link-button" disabled={!hasMeasurementDrafts} onClick={() => setReviewerValues({})} title={hasMeasurementDrafts ? "Descartar borradores locales y volver a los valores persistidos" : "No hay mediciones del revisor editadas"} type="button">Descartar borradores</button>
          </div>
          <p className="muted compact-copy">IA original y revisor se mantienen separados. La confianza y el valor atípico pertenecen a IA; no se inventan para la corrección del revisor.</p>
          <table className="measurement-review-table" aria-label="Mediciones">
            <thead>
              <tr className="measurement-review-head">
                <th scope="col">Métrica</th>
                <th scope="col">Valor IA original</th>
                <th scope="col">Valor del revisor</th>
                <th scope="col">Diferencia</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {resultRows.map((item) => (
                <tr className={`measurement-review-row ${item.draftValue !== undefined && item.draftValue !== "" ? "is-draft" : ""}`} key={item.id}>
                  <td className="measurement-metric-cell" data-label="Métrica">
                    <strong title={item.label}>{displayMeasurementLabel(item.label)}</strong>
                    <small>{displayMeasurementLevel(item.level)}</small>
                    <span className={`confidence-pill ${confidenceToneClass(item.confidence)}`}>{item.confidence !== undefined ? `Confianza IA ${Math.round(item.confidence * 100)}%` : "Confianza IA N/D"}</span>
                    {item.outlier && <StatusBadge tone="amber">Atípico IA</StatusBadge>}
                  </td>
                  <td className="tabular-value" data-label="Valor IA original"><em>IA</em>{item.aiValue} {displayUnit(item.unit)}</td>
                  <td className="reviewer-input-cell" data-label="Valor del revisor">
                    <input aria-label={`Valor del revisor para ${item.label}. Valor IA original ${item.aiValue} ${displayUnit(item.unit)}`} className="reviewer-value-input" inputMode="decimal" onChange={(event) => updateReviewerValue(item, event.target.value)} placeholder={String(item.aiValue ?? "")} value={String(item.reviewerValue ?? "")} />
                    <button className="measurement-reset-button" disabled={item.draftValue === undefined && (item.persistedValue === undefined || item.persistedValue === null || item.persistedValue === "")} onClick={() => resetReviewerValue(item.id)} title={item.persistedValue !== undefined && item.persistedValue !== null && item.persistedValue !== "" ? "Restaurar en borrador: enviará el valor IA como corrección explícita" : "Restaurar valor IA para esta medición"} type="button">Restaurar</button>
                    {item.draftValue !== undefined && item.draftValue !== "" && <span className="draft-chip">Borrador</span>}
                  </td>
                  <td data-label="Diferencia"><span className={`delta-chip delta-${item.severity}`}>{formatDelta(item.delta, item.unit)}</span></td>
                  <td data-label="Estado"><StatusBadge tone={item.status === "guardado" ? "green" : item.status === "draft" ? "blue" : "slate"}>{item.status === "draft" ? "Borrador" : item.status === "guardado" ? "Guardado" : "Sin cambios"}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasReviewerDrafts && <p className="viewer-limit-note">{reviewerDraftCount} medición/es y {landmarkDraftCount} landmark/s en borrador. Mediciones se envían en la revisión canónica; landmarks quedan en borrador local no persistido, pendiente BE-008/FE-010 + AI-011.</p>}
        </section>
      </section>
      <PrivacyBanner />
    </div>
  );
}
