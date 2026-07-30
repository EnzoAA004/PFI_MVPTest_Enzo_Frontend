import { useEffect, useMemo, useState } from "react";
import { exportReviewReport } from "../api";
import { resolvePersistedPlaneWorkspace, type PersistedPlaneWorkspace } from "../appDataGuards";
import type { AiModelArtifact, AiRunResponse, AgentQuality, AuditEvent, Measurement, ReviewStatus, ReviewStatusResponse, StudyDetailResponse, StudyLandmark, StudyMask, StudyMetadataInput, StudySeries } from "../appTypes";
import { parseThreeD } from "../adapters/multiplanarRunAdapter";
import { parseThreeDProxyMeshAsset, ThreeDProxyAssetError } from "../adapters/threeDProxyAssetParser";
import { canonicalThreeDToProxyViewModel, type ThreeDProxyAssetFetchState } from "../viewModels/threeDProxyViewModel";
import { BackendApiError, fetchThreeDProxyAsset } from "../multiplanarApi";
import { displayInferenceMode, displayMeasurementLabel, displayMeasurementLabelShort, displayMeasurementLevel, displayModality, displayReviewPriority, displayReviewStatus, displayTechnicalReadiness, displayUnit } from "../clinicalDisplay";
import { allFindingsUnassigned, groupFindingsByLevel, type LevelGroup } from "../features/reading/readingFindings";
import { loadSelectedStudyDetail, SELECTED_STUDY_EVENT } from "../selectedStudyStorage";
import { updateStudyMetadata } from "../studyApi";
import { displayModelKey, displayPrimaryPlane, displayStudyDate, displaySubjectRef } from "../studyDisplay";
import { emptyStudyMetadataDraft, normalizeStudyMetadataInput, priorityToBackend, subjectRefErrorMessage, validateSubjectRef, type StudyMetadataDraft } from "../studyMetadata";
import { studyRunToMriViewerModel } from "../viewModels/mriViewerViewModel";
import { AgentSummary } from "./AgentSummary";
import { AuditTrail } from "./AuditTrail";
import { MriSliceViewer } from "./MriSliceViewer";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";

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
  // El contrato v1 publica la metadata volumétrica bajo `metadata` y v2 bajo
  // `input`; también se consulta el plano canónico persistido, que es de donde
  // viene la corrida reabierta.
  const canonicalPlane = asRecord(asRecord(run.canonicalRun?.planes)?.[workspace.plane]);
  const metadata = { ...asRecord(canonicalPlane?.input), ...asRecord(canonicalPlane?.metadata), ...asRecord(planeRun?.input), ...asRecord(planeRun?.metadata) };
  const rawSliceCount = metadata.sliceCount;
  const rawSelectedSlice = metadata.selectedSlice ?? metadata.selectedSliceIndex;
  const sliceCount = typeof rawSliceCount === "number" && rawSliceCount > 0 ? rawSliceCount : 1;
  const selectedSlice = typeof rawSelectedSlice === "number" && rawSelectedSlice >= 0 ? rawSelectedSlice : 0;
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
  const [editMode, setEditMode] = useState(false);
  const [selectedLandmark, setSelectedLandmark] = useState("L4");
  const [overlayAvailableByPlano, setOverlayAvailableByPlano] = useState<Record<string, boolean>>({});
  const [reviewerValues, setReviewerValues] = useState<Record<string, string>>({});
  const [landmarkDrafts, setLandmarkDrafts] = useState<Record<string, StudyLandmark>>({});
  const [landmarkAddMode, setLandmarkAddMode] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(run.review?.status ?? run.reviewStatus ?? "pendiente");
  const [notes, setNotes] = useState(run.review?.notes ?? run.review?.observations ?? "");
  const [saveMessage, setSaveMessage] = useState("");
  // Right panel of the reading room: clinical findings first, review second, and
  // everything technical kept out of the clinical surface entirely.
  const [panelTab, setPanelTab] = useState<"findings" | "review" | "technical">("findings");
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
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

  // P9-C.5 Parte B: threeD reabierto desde el snapshot durable del backend
  // (canonicalRun/metricsSnapshot), nunca desde el AI Module en vivo. Mismo
  // parser que el flujo de analisis en curso (multiplanarRunAdapter.ts) porque
  // el backend persiste threeD con la forma exacta que ya produce el AI Module.
  const persistedThreeD = useMemo(
    () => (demoMode ? undefined : parseThreeD(run.canonicalRun?.threeD ?? run.metricsSnapshot?.threeD)),
    [demoMode, run.canonicalRun, run.metricsSnapshot],
  );
  const [threeDAssetState, setThreeDAssetState] = useState<ThreeDProxyAssetFetchState>({ status: "idle" });
  const threeDMeshAssetUrl = persistedThreeD?.enabled ? persistedThreeD.assets.find((asset) => asset.assetName.endsWith(".json"))?.url : undefined;

  useEffect(() => {
    if (!threeDMeshAssetUrl) {
      setThreeDAssetState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setThreeDAssetState({ status: "loading" });
    fetchThreeDProxyAsset(threeDMeshAssetUrl)
      .then((raw) => {
        if (cancelled) return;
        try {
          const asset = parseThreeDProxyMeshAsset(raw);
          setThreeDAssetState({ status: "loaded", asset });
        } catch (error) {
          if (error instanceof ThreeDProxyAssetError) setThreeDAssetState({ status: "invalid" });
          else throw error;
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setThreeDAssetState({ status: "error", traceId: error instanceof BackendApiError ? error.traceId : undefined });
      });
    return () => { cancelled = true; };
  }, [threeDMeshAssetUrl]);

  const threeDProxyViewModel = useMemo(
    () => canonicalThreeDToProxyViewModel(persistedThreeD, threeDAssetState, displayRun.humanReviewRequired ?? null),
    [persistedThreeD, threeDAssetState, displayRun.humanReviewRequired],
  );

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

  const levelGroups = useMemo(
    () => groupFindingsByLevel(resultRows.map((row) => ({
      id: row.id,
      label: row.label,
      level: row.level,
      value: row.reviewerValue ?? row.aiValue,
      unit: row.unit,
      confidence: row.confidence,
      outlier: row.outlier,
    }))),
    [resultRows],
  );
  const levelUnassigned = allFindingsUnassigned(levelGroups);
  const activeGroup = levelGroups.find((group: LevelGroup) => String(group.level) === String(selectedLevel));
  const visibleRows = activeGroup ? resultRows.filter((row) => activeGroup.findings.some((finding) => finding.id === row.id)) : resultRows;
  const caseLabel = displayRun.caseId ?? studyReview?.caseId ?? "Caso sin identificador";
  const subjectLabel = displaySubjectRef(selectedDetail?.study?.subjectRef ?? run.patientId ?? null);
  const sliceLabel = currentSeries?.sliceCount ? `corte ${currentSeries.selectedSlice ?? 1}/${currentSeries.sliceCount}` : "corte único";

  return (
    <div className="rr" data-theme="reading">
      <header className="rr-topbar">
        <button className="rr-back" onClick={onBackToStudies} type="button">← Lista de trabajo</button>
        <div className="rr-case">
          <strong>{caseLabel}</strong>
          <span>
            {displayModality(selectedDetail?.study?.modality ?? run.modality ?? null)}
            {" · "}{displayStudyDate(selectedDetail?.study?.studyDate ?? run.studyDate ?? null)}
            {" · "}{subjectLabel}
          </span>
        </div>
        <div className="rr-topbar-right">
          <span className="rr-status" data-status={review.status ?? "pendiente"}>
            <i aria-hidden />{displayReviewStatus(review.status ?? "pendiente")}
          </span>
          <button className="rr-ghost" onClick={() => setMetadataDialogOpen(true)} type="button">Editar datos</button>
        </div>
      </header>

      <div className="rr-body">
        <aside className="rr-series" aria-label="Series del estudio">
          <p className="rr-rail-title">Series</p>
          {seriesList.length ? seriesList.map((item: any, index: number) => (
            <button className={`rr-serie ${currentSeries?.id === item.id ? "is-active" : ""}`} key={item.id} onClick={() => selectSeries(item)} type="button">
              <span className="rr-thumb">
                {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <em>{String(index + 1).padStart(2, "0")}</em>}
              </span>
              <span className="rr-serie-name">{item.name}</span>
              <span className="rr-serie-meta">{item.sliceCount ? `${item.sliceCount} corte${item.sliceCount === 1 ? "" : "s"}` : item.available ? "1 corte" : "sin asset"}</span>
            </button>
          )) : <p className="rr-note">Sin planos persistidos.</p>}

          <button className={`rr-serie ${tab === "3D Reconstruction" ? "is-active" : ""}`} onClick={() => setTab("3D Reconstruction")} type="button">
            <span className="rr-thumb"><em>3D</em></span>
            <span className="rr-serie-name">Proxy 3D</span>
            <span className="rr-serie-meta">experimental</span>
          </button>
        </aside>

        <main className="rr-stage">
          <div className="rr-viewport">
            {tab === "3D Reconstruction" ? (
              <SpineReconstructionPreview proxy={threeDProxyViewModel} />
            ) : (
              <>
                {/* DICOM-style corner annotations burned over the image. */}
                <div className="rr-corner rr-corner-tl">
                  <strong>{caseLabel}</strong>
                </div>
                <div className="rr-corner rr-corner-tr">
                  <strong>{currentSeries?.name ?? displayPrimaryPlane(activePlano)}</strong>
                  {sliceLabel}
                </div>
                <div className="rr-corner rr-corner-bl">
                  {displayRun.modelVersion ?? modelArtifact?.version ?? displayModelKey(displayRun.modelKey)}
                  {"\n"}{inferenceModeLabel(inferenceMode)}
                </div>
                <div className="rr-corner rr-corner-br">
                  {quality?.pixelSpacingMm ? `${quality.pixelSpacingMm} mm/px` : "escala no informada"}
                  {"\n"}<span className="rr-disclaimer">No apto para diagnóstico clínico</span>
                </div>
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
              </>
            )}
          </div>
        </main>

        <aside className="rr-panel" aria-label="Panel de revisión">
          <div className="rr-tabs" role="tablist">
            <button className={panelTab === "findings" ? "is-active" : ""} onClick={() => setPanelTab("findings")} role="tab" aria-selected={panelTab === "findings"} type="button">Hallazgos</button>
            <button className={panelTab === "review" ? "is-active" : ""} onClick={() => setPanelTab("review")} role="tab" aria-selected={panelTab === "review"} type="button">Revisión</button>
            <button className={panelTab === "technical" ? "is-active" : ""} onClick={() => setPanelTab("technical")} role="tab" aria-selected={panelTab === "technical"} type="button">Técnico</button>
          </div>

          <div className="rr-panel-body">
            {panelTab === "findings" && (
              <>
                <p className="rr-section-title">Niveles</p>
                <div className="rr-levels">
                  {levelGroups.map((group: LevelGroup) => {
                    const key = String(group.level);
                    const active = String(selectedLevel) === key;
                    return (
                      <button
                        key={key}
                        className={`rr-level${active ? " is-active" : ""}${group.findings.length ? "" : " is-empty"}`}
                        onClick={() => setSelectedLevel(active ? null : key)}
                        type="button"
                      >
                        <span className="rr-level-name">{group.label}</span>
                        <span className="rr-level-count">{group.findings.length ? `${group.findings.length}` : "—"}</span>
                      </button>
                    );
                  })}
                </div>
                {levelUnassigned && (
                  <p className="rr-note">
                    El modelo todavía no informa el nivel vertebral de cada medición, por lo que
                    ninguna puede atribuirse a L1-L2…L5-S1. Se listan sin nivel asignado en vez de
                    repartirlas por suposición.
                  </p>
                )}

                <p className="rr-section-title">
                  Mediciones{activeGroup ? ` · ${activeGroup.label}` : ""}
                </p>
                {visibleRows.length ? (
                  <div className="rr-measures">
                    {visibleRows.map((item) => (
                      <div className={`rr-measure${item.draftValue !== undefined && item.draftValue !== "" ? " rr-measure-edited" : ""}`} key={item.id}>
                        <span className="rr-measure-label" title={displayMeasurementLabel(item.label)}>{displayMeasurementLabelShort(item.label)}</span>
                        <span className="rr-measure-value">
                          {String(item.reviewerValue ?? item.aiValue ?? "—")}<u>{displayUnit(item.unit)}</u>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <p className="rr-note">Sin mediciones en este nivel.</p>}
              </>
            )}

            {panelTab === "review" && (
              <>
                <p className="rr-section-title">Mediciones del revisor</p>
                {resultRows.length ? (
                  <div className="rr-measures">
                    {resultRows.map((item) => (
                      <label className="rr-measure" key={item.id}>
                        <span className="rr-measure-label" title={displayMeasurementLabel(item.label)}>
                          {displayMeasurementLabelShort(item.label)}
                          <u style={{ display: "block", opacity: .7 }}>IA {String(item.aiValue ?? "—")} {displayUnit(item.unit)}</u>
                        </span>
                        <input
                          aria-label={`Valor del revisor para ${displayMeasurementLabel(item.label)}`}
                          inputMode="decimal"
                          onChange={(event) => updateReviewerValue(item, event.target.value)}
                          placeholder={String(item.aiValue ?? "")}
                          value={String(item.reviewerValue ?? "")}
                          style={{ width: "88px", textAlign: "right", fontFamily: "var(--font-mono)" }}
                        />
                      </label>
                    ))}
                  </div>
                ) : <p className="rr-note">La corrida no devolvió mediciones.</p>}

                <label className="rr-field">
                  <span>Notas de revisión</span>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Hallazgos, observaciones o motivo del estado…" />
                </label>

                <label className="rr-field">
                  <span>Estado</span>
                  <select aria-label="Estado de revisión" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}>
                    <option value="pendiente">Pendiente</option>
                    <option value="observado">Observado</option>
                    <option value="aceptado">Finalizado</option>
                    <option value="descartado">Descartado</option>
                  </select>
                </label>

                <div className="rr-actions">
                  <button className="rr-ghost rr-secondary" disabled={saving} onClick={() => void save("pendiente")} type="button">Guardar borrador</button>
                  <button className="rr-primary" disabled={confirmDisabled} onClick={() => void save(reviewStatus)} title={reviewStatus === "pendiente" ? "Usá Guardar borrador para conservar una revisión pendiente." : undefined} type="button">Confirmar</button>
                </div>
                {saveMessage && <p className="rr-ok" role="status">{saveMessage}</p>}

                <AgentSummary agentDecision={run.aiOutput?.agentDecision ?? studyReview?.aiOutput?.agentDecision ?? run.agentDecision} />

                <p className="rr-section-title">Auditoría</p>
                <AuditTrail events={auditTrail.slice(0, 4)} />
              </>
            )}

            {panelTab === "technical" && (
              <>
                <p className="rr-section-title">Inferencia</p>
                <dl className="rr-tech">
                  <dt>Modo efectivo</dt><dd>{inferenceModeLabel(inferenceMode)}</dd>
                  <dt>Solicitado</dt><dd>{inferenceModeLabel(requestedInferenceMode)}</dd>
                  <dt>Preparación</dt><dd>{readinessLabel(modelReadiness)}</dd>
                  <dt>Modelo</dt><dd>{displayRun.modelVersion ?? modelArtifact?.version ?? displayModelKey(displayRun.modelKey)}</dd>
                </dl>

                <p className="rr-section-title">Plano activo</p>
                <dl className="rr-tech">
                  <dt>Plano</dt><dd>{currentSeries?.name ?? "sin plano persistido"}</dd>
                  <dt>Run de plano</dt><dd>{activeWorkspace.planeRunId ?? "no informado"}</dd>
                  <dt>Storage</dt><dd>{activeWorkspace.storageStatus}</dd>
                  <dt>Superposición</dt><dd>{overlayAvailable ? "overlay.png" : activeWorkspace.overlayUrl ? "verificando" : "no disponible"}</dd>
                  <dt>Borradores</dt><dd>{reviewerDraftCount} med · {landmarkDraftCount} lm</dd>
                </dl>

                <p className="rr-section-title">Estudio de-identificado</p>
                <dl className="rr-tech">
                  <dt>Edad</dt><dd>{String(patientSafe.ageAtStudy ?? patientSafe.age ?? "desconocida")}</dd>
                  <dt>Sexo</dt><dd>{String(patientSafe.sex ?? "desconocido")}</dd>
                  <dt>Región</dt><dd>{String(patientSafe.bodyRegion ?? "no informada")}</dd>
                  <dt>Resolución</dt><dd>{String(patientSafe.imageResolution ?? (quality?.pixelSpacingMm ? `${quality.pixelSpacingMm} mm` : "sin datos"))}</dd>
                  <dt>Revisor</dt><dd>{reviewerName}</dd>
                </dl>

                <p className="rr-section-title">Segmentación</p>
                <p className="rr-note">
                  {masks.length
                    ? "El backend entrega una superposición combinada; todavía no hay máscaras por clase, por eso no se pueden encender ni apagar individualmente."
                    : "No hay máscaras por clase persistidas: solo se muestra la superposición combinada."}
                </p>
                <p className="rr-note">
                  Los landmarks del revisor son borradores locales y aún no se persisten.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>

      <footer className="rr-toolbar" role="toolbar" aria-label="Herramientas de lectura">
        <button
          className={`rr-tool${editMode ? " is-active" : ""}`}
          disabled={!activeCoordinateSpace}
          onClick={() => { setEditMode((value) => !value); setLandmarkAddMode(false); }}
          title={activeCoordinateSpace ? "Mover landmarks de IA como borrador del revisor" : "El backend no informó el espacio de coordenadas"}
          type="button"
        >
          Editar landmark
        </button>
        <button
          className={`rr-tool${landmarkAddMode ? " is-active" : ""}`}
          disabled={!editMode || !activeCoordinateSpace}
          onClick={() => setLandmarkAddMode((value) => !value)}
          title={!activeCoordinateSpace ? "El backend no informó el espacio de coordenadas" : editMode ? "Clic sobre la imagen para agregar un landmark" : "Activá Editar landmark primero"}
          type="button"
        >
          Agregar landmark
        </button>
        <span className="rr-toolbar-sep" aria-hidden />
        <button className="rr-tool" disabled={!hasReviewerDrafts} onClick={resetReviewerDrafts} title={hasReviewerDrafts ? "Descartar borradores del revisor" : "No hay borradores"} type="button">
          Deshacer
        </button>
        <button className="rr-tool" disabled={!hasMeasurementDrafts} onClick={() => setReviewerValues({})} title={hasMeasurementDrafts ? "Volver a los valores persistidos" : "No hay mediciones editadas"} type="button">
          Restaurar mediciones
        </button>

        <span className="rr-toolbar-end">
          {hasReviewerDrafts ? <span>{reviewerDraftCount} med · {landmarkDraftCount} lm en borrador</span> : null}
          <span className="rr-kbd">?</span>
          <span>Revisión humana requerida</span>
        </span>
      </footer>

      {metadataDialogOpen && (
        <div className="rr-dialog-backdrop" role="presentation">
          <section className="rr-dialog" role="dialog" aria-modal="true" aria-labelledby="metadata-dialog-title">
            <h2 id="metadata-dialog-title">Editar datos del estudio</h2>
            <div className="rr-dialog-grid">
              <label className="rr-field rr-span-all">
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
              {subjectRefLocked && <p className="rr-note rr-span-all">La referencia de-identificada ya fue asignada y no puede reemplazarse. Esto evita vincular estudios de personas distintas.</p>}
              <label className="rr-field">
                <span>Fecha del estudio</span>
                <input type="date" value={metadataDraft.studyDate} onChange={(event) => setMetadataDraft((current) => ({ ...current, studyDate: event.target.value }))} />
              </label>
              <label className="rr-field">
                <span>Modalidad</span>
                <select value={metadataDraft.modality} onChange={(event) => setMetadataDraft((current) => ({ ...current, modality: event.target.value }))}>
                  <option value="">No informada</option>
                  <option value="MRI">Resonancia magnética</option>
                </select>
              </label>
              <label className="rr-field">
                <span>Prioridad</span>
                <select value={metadataDraft.reviewPriority} onChange={(event) => setMetadataDraft((current) => ({ ...current, reviewPriority: event.target.value as StudyMetadataDraft["reviewPriority"] }))}>
                  <option value="low">{displayReviewPriority("low")}</option>
                  <option value="medium">{displayReviewPriority("medium")}</option>
                  <option value="high">{displayReviewPriority("high")}</option>
                </select>
              </label>
              <label className="rr-field rr-span-all">
                <span>Descripción</span>
                <input maxLength={200} value={metadataDraft.description} onChange={(event) => setMetadataDraft((current) => ({ ...current, description: event.target.value }))} placeholder="RM lumbar sagital T2" />
              </label>
            </div>
            <p className="rr-note">No ingreses nombre, DNI, correo, teléfono, domicilio ni historia clínica real.</p>
            {metadataError && <p className="rr-error" role="alert">{metadataError}</p>}
            <div className="rr-actions">
              <button className="rr-ghost rr-secondary" onClick={() => setMetadataDialogOpen(false)} disabled={metadataSaving} type="button">Cancelar</button>
              <button className="rr-primary" onClick={() => void saveStudyMetadata()} disabled={metadataSaving} type="button">{metadataSaving ? "Guardando…" : "Guardar"}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
