import { useCallback, useEffect, useMemo, useState } from "react";
import { exportReviewReport, getRunAnnotations, saveRunAnnotations } from "../api";
import { resolvePersistedPlaneWorkspace, type PersistedPlaneWorkspace } from "../appDataGuards";
import type { AiModelArtifact, AiRunResponse, AgentQuality, AuditEvent, Measurement, ReviewStatus, ReviewStatusResponse, StudyDetailResponse, StudyLandmark, StudyMask, StudyMetadataInput, StudySeries } from "../appTypes";
import { parseThreeD } from "../adapters/multiplanarRunAdapter";
import { parseThreeDProxyMeshAsset, ThreeDProxyAssetError } from "../adapters/threeDProxyAssetParser";
import { canonicalThreeDToProxyViewModel, type ThreeDProxyAssetFetchState } from "../viewModels/threeDProxyViewModel";
import { BackendApiError, fetchThreeDProxyAsset } from "../multiplanarApi";
import { displayInferenceMode, displayMeasurementLabel, resolveMeasurementLabel, displayMeasurementLabelShort, displayMeasurementLevel, displayModality, displayReviewPriority, displayReviewStatus, displayStructureLabel, displayTechnicalReadiness, displayUnit, type SpineLevel } from "../clinicalDisplay";
import { allFindingsUnassigned, groupFindingsByLevel, type LevelGroup } from "../features/reading/readingFindings";
import { MeasurementPanel, type PanelRow } from "../features/reading/MeasurementPanel";
import { PlaneViewport } from "../features/reading/PlaneViewport";
import { instanceColor, instanceLabel, parseSegmentation, type Segmentation } from "../features/reading/segmentation";
import { parseSlicePixelsMeta, type SlicePixelsMeta } from "../features/reading/pixels";
import { coordinateEvidence, parseVolumeGeometry, referenceLineOn, slicePlaneAt } from "../features/reading/referenceLine";
import { annotatedSlices, displayAnnotationScope, formatMeasurement, isAnnotationVisible, measureDistance, type Annotation, type AnnotationScope } from "../features/reading/annotations";
import { updateStudyMetadata } from "../studyApi";
import { displayModelKey, displayPrimaryPlane, displayStudyDate, displaySubjectRef } from "../studyDisplay";
import { emptyStudyMetadataDraft, normalizeStudyMetadataInput, priorityToBackend, subjectRefErrorMessage, validateSubjectRef, type StudyMetadataDraft } from "../studyMetadata";
import { studyRunToMriViewerModel } from "../viewModels/mriViewerViewModel";
import { useAuthenticatedImageUrl } from "../authenticatedAssets";
import { AgentSummary } from "./AgentSummary";
import { AuditTrail } from "./AuditTrail";
import { MriSliceViewer, type MeasurementOverlay, type RawSlicePixels, type SliceNavigation } from "./MriSliceViewer";
import { useMeasureTool, TOOL_LABELS, TOOL_SHORTCUTS } from "../features/reading/useMeasureTool";
import {
  formatMeasurementValue, intensityStats, polygonArea, probeIntensity, recomputeValue,
  type MeasurementKind,
} from "../features/reading/measurements";
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
  /** "study" cuando la medición no describe un nivel. Por defecto, "level". */
  levelScope?: string;
  /** Extremos entre los que se midió, en la base 0..256. Vacío si no es distancia. */
  points?: { x: number; y: number }[];
  /** Derivada de la geometría de otras estructuras, no de una máscara propia. */
  experimental?: boolean;
  /** Segunda magnitud, cuando la medición la tiene: el grado de Meyerding. */
  detail?: string;
  /** Corte y plano de los que salió; sin ellos el segmento no se puede ubicar. */
  sliceIndex?: number;
  plane?: "sagittal" | "axial";
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
  /** Detalle persistido del estudio abierto, cargado y poseído por App. */
  selectedDetail: StudyDetailResponse | null;
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
  // Cantidad de previsualizaciones por corte que el AI Module realmente escribió.
  // Es lo que distingue "este corte todavía no tiene imagen" de "este corte tiene
  // imagen": sin el número habría que pedir el PNG y tratar el 404 como respuesta.
  const quality = { ...asRecord(canonicalPlane?.quality), ...asRecord(planeRun?.quality) };
  const rawSpacing = metadata.inPlaneSpacingMm ?? metadata.inPlaneSpacing;
  const inPlaneSpacingMm = Array.isArray(rawSpacing) && rawSpacing.every((value) => typeof value === "number")
    ? rawSpacing as number[]
    : undefined;
  const rawPreviewCount = quality.slicePreviewCount;
  const slicePreviewCount = typeof rawPreviewCount === "number" && rawPreviewCount > 0 ? rawPreviewCount : 0;
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
    slicePreviewCount,
    inPlaneSpacingMm,
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

/**
 * URL de la previsualización de un corte, derivada de la del corte inferido.
 *
 * Ambas viven en el mismo directorio de assets de la corrida, así que se
 * reemplaza el último segmento y nada más: no se arma una ruta nueva ni se
 * concatena el índice a mano, de modo que el origen y el prefijo `/api/...` que
 * la política de origen exige quedan intactos.
 */
function slicePreviewUrl(inputUrl: string | null | undefined, index: number) {
  if (!inputUrl) return undefined;
  const name = `slice-${String(index).padStart(3, "0")}.png`;
  const separator = inputUrl.lastIndexOf("/");
  return separator < 0 ? undefined : `${inputUrl.slice(0, separator + 1)}${name}`;
}

function clampSlice(index: number, total: number) {
  return Math.min(Math.max(index, 0), Math.max(0, total - 1));
}


/**
 * Miniatura del rail de series.
 *
 * Los assets del backend exigen Authorization, así que un <img src> directo se
 * pide sin cabeceras y recibe 401. Se carga con el mismo fetch autenticado que el
 * visor, que entrega un blob URL; mientras no haya imagen se muestra el índice.
 */
function SeriesThumbnail({ url, index }: { url?: string | null; index: number }) {
  const asset = useAuthenticatedImageUrl(url ?? undefined);
  if (asset.state === "loaded" && asset.url) return <img src={asset.url} alt="" />;
  return <em>{String(index + 1).padStart(2, "0")}</em>;
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

/** Primer valor realmente presente: "" es ausencia, y `??` no la detecta. */
function firstPresent(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeRow(item: any): MeasurementRow {
  const value = item.aiValue ?? item.value ?? "";
  const label = resolveMeasurementLabel(item);
  return {
    id: String(item.id ?? item.labelKey ?? item.label ?? "measurement"),
    label,
    level: String(item.level ?? "Nivel no informado"),
    levelScope: item.levelScope === "study" ? "study" : "level",
    points: Array.isArray(item.points) && item.points.length === 2 ? item.points : undefined,
    experimental: item.experimental === true,
    detail: typeof item.detail === "string" ? item.detail : undefined,
    sliceIndex: typeof item.sliceIndex === "number" ? item.sliceIndex : undefined,
    plane: item.plane === "sagittal" || item.plane === "axial" ? item.plane : undefined,
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

export function StudyReviewView({ run, studyReview, measurements, auditTrail, saving, onBackToStudies, onMeasurementsChange, onSaveReview, onStudyMetadataUpdated, selectedDetail }: StudyReviewViewProps) {
  const [tab, setTab] = useState<"Sagittal" | "Axial" | "3D Reconstruction">("Sagittal");
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selectedLandmark, setSelectedLandmark] = useState("L4");
  const [overlayAvailableByPlano, setOverlayAvailableByPlano] = useState<Record<string, boolean>>({});
  const [reviewerValues, setReviewerValues] = useState<Record<string, string>>({});
  const [landmarkDrafts, setLandmarkDrafts] = useState<Record<string, StudyLandmark>>({});
  const [landmarkAddMode, setLandmarkAddMode] = useState(false);
  const measureTool = useMeasureTool();
  /*
   * Una letra por herramienta, como en cualquier estación de lectura. Se ignora
   * mientras el foco está en un campo de texto: escribir "distancia" en una nota no
   * puede ir cambiando de herramienta letra por letra.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];
      if (tool) measureTool.select(tool);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [measureTool]);
  /*
   * Contornos corregidos por el revisor, por id de máscara.
   *
   * Es un borrador: la máscara de la IA no se pisa hasta que el revisor guarda.
   * Mientras tanto conviven la propuesta y la corrección, que es lo que permite
   * descartarla con "Deshacer" sin haber perdido el original.
   */
  const [contourDrafts, setContourDrafts] = useState<Record<string, { x: number; y: number }[]>>({});
  /* Instancias que el revisor ocultó, por plano. */
  const [hiddenInstances, setHiddenInstances] = useState<Record<string, number[]>>({});
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteScope, setNoteScope] = useState<AnnotationScope>("study");
  const [annotationsError, setAnnotationsError] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(run.review?.status ?? run.reviewStatus ?? "pendiente");
  const [notes, setNotes] = useState(run.review?.notes ?? run.review?.observations ?? "");
  const [saveMessage, setSaveMessage] = useState("");
  // Right panel of the reading room: clinical findings first, review second, and
  // everything technical kept out of the clinical surface entirely.
  const [panelTab, setPanelTab] = useState<"findings" | "review" | "technical">("findings");
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  /*
   * Geometría corregida por el revisor, por id de medición. Se guarda aparte de la
   * de la IA, que nunca se pisa: lo que el médico corrige queda al lado de lo que la
   * IA propuso, no encima.
   */
  const [measureGeometry, setMeasureGeometry] = useState<Record<string, { x: number; y: number }[]>>({});
  /*
   * Cuál medición está elegida y cuál está señalada desde el panel. Son estados
   * distintos: señalar es pasar el mouse por una fila para saber qué línea es cuál,
   * elegir es decidir trabajar sobre ella y hace aparecer sus tiradores.
   */
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [highlightedMeasurementId, setHighlightedMeasurementId] = useState<string | null>(null);
  // Corte visible por plano. Arranca en el corte que analizó la IA y se mueve con
  // la rueda o el teclado; queda por plano para que cambiar de serie no lo pierda.
  const [sliceByPlane, setSliceByPlane] = useState<Record<string, number>>({});
  // Disposición del stage: un plano a la vez o sagital y axial simultáneos, que es
  // como se lee en la práctica (el axial se interpreta mirando dónde cae en sagital).
  const [layout, setLayout] = useState<"single" | "dual">("single");

  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState<StudyMetadataDraft>(() => metadataDraftFromDetail(selectedDetail, run));
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataError, setMetadataError] = useState("");

  /*
   * Anotaciones persistidas de la corrida. Se descartan las locales al cambiar de
   * corrida: pertenecen a la que se estaba leyendo y arrastrarlas mostraría marcas
   * de un estudio sobre otro.
   */
  useEffect(() => {
    const runId = run.runId;
    setAnnotations([]);
    setAnnotationsError("");
    if (!runId) return;
    let cancelled = false;
    getRunAnnotations(runId)
      .then((persisted) => { if (!cancelled) setAnnotations(persisted as Annotation[]); })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAnnotationsError(error instanceof Error ? `No se pudieron cargar las anotaciones: ${error.message}` : "No se pudieron cargar las anotaciones.");
      });
    return () => { cancelled = true; };
  }, [run.runId]);

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
  const review = useMemo(() => displayRun.review ?? { status: run.reviewStatus ?? "pendiente" as ReviewStatus }, [displayRun.review, run.reviewStatus]);
  const seriesList = persistedSeries.length ? persistedSeries : demoMode ? hasPipelineVisualContract ? run.series ?? fallbackSeries : Array.isArray(studyReview?.series) && studyReview.series.length ? studyReview.series : fallbackSeries : [];
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

  /*
   * Las mediciones se leen del plano que se está mirando.
   *
   * Antes se prefería siempre el sagital, así que al pasar al axial el panel seguía
   * mostrando alturas y anchos discales sagitales: números reales, del corte
   * equivocado, sobre una imagen que no los sostiene. Cuando la corrida tiene planos
   * persistidos manda el plano activo aunque quede vacío — "este plano no midió esto"
   * es una respuesta correcta; mostrar lo del otro plano no lo es. La cadena de
   * respaldo queda solo para las corridas viejas, que no separan por plano.
   */
  const hasPlaneWorkspaces = sagittalWorkspace.measurements.length > 0 || axialWorkspace.measurements.length > 0;
  const persistedMeasurements = activePlano === "axial" ? axialWorkspace.measurements : sagittalWorkspace.measurements;
  const sourceMeasurements = hasPlaneWorkspaces
    ? persistedMeasurements
    : selectedDetail?.measurements?.length ? selectedDetail.measurements : pipelineMeasurements.length ? pipelineMeasurements : measurements;

  /*
   * Las máscaras de una corrida persistida viven en el plano canónico, no en el
   * nivel legacy de `run`: leer solo ahí dejaba la leyenda de segmentación vacía en
   * la sala de lectura aunque el estudio tuviera sus tres clases.
   */
  const canonicalMasksFor = (plane: "sagittal" | "axial"): StudyMask[] => {
    const canonicalPlane = asRecord(asRecord(displayRun.canonicalRun?.planes)?.[plane]);
    const value = canonicalPlane?.masks;
    if (!Array.isArray(value)) return [];
    // El plano canónico identifica la clase con `classKey`, no con `label` ni
    // `className`, que es lo que busca el view model: sin traducirlo la leyenda
    // mostraba el id del asset ("mask-sagittal-vertebra-group") como nombre de la
    // estructura, y ese id no sirve para resolver la máscara de la clase.
    return value.flatMap((raw) => {
      const mask = asRecord(raw);
      const classKey = typeof mask?.classKey === "string" ? mask.classKey : undefined;
      if (!mask || !classKey) return [];
      // El contorno viaja en `geometry.points`, en la base del coordinateSpace.
      const geometry = asRecord(mask.geometry);
      const rawPoints = Array.isArray(geometry?.points) ? geometry.points : [];
      const points = rawPoints.flatMap((entry) => {
        const point = asRecord(entry);
        return typeof point?.x === "number" && typeof point?.y === "number" ? [{ x: point.x, y: point.y }] : [];
      });
      return [{
        id: String(mask.id ?? classKey),
        label: classKey,
        className: classKey,
        color: typeof mask.color === "string" ? mask.color : "",
        level: typeof mask.level === "string" ? mask.level : undefined,
        confidence: typeof mask.confidence === "number" ? mask.confidence : undefined,
        enabled: mask.enabled !== false,
        contours: points.length >= 3
          ? [{ seriesId: String(mask.id ?? classKey), sliceIndex: Number(geometry?.sliceIndex ?? 0), points }]
          : undefined,
      } satisfies StudyMask];
    });
  };
  const masks = demoMode
    ? hasPipelineVisualContract && Array.isArray(run.masks) ? run.masks : Array.isArray(studyReview?.masks) && studyReview.masks.length ? studyReview.masks : fallbackMasks
    : Array.isArray(run.masks) && run.masks.length ? run.masks : canonicalMasksFor(activePlano);

  /**
   * Máscaras de un plano, con la corrección del revisor aplicada.
   *
   * Se resuelven por plano y no una sola vez: en 1×2 los dos viewports se montan a
   * la vez, y pasarles las del plano activo hacía que el sagital dibujara la
   * segmentación del axial sobre su propia imagen.
   */
  /** Mapa de instancias de un plano, si la corrida lo publicó. */
  function segmentationForPlane(plane: "sagittal" | "axial"): Segmentation | undefined {
    const canonicalPlane = asRecord(asRecord(displayRun.canonicalRun?.planes)?.[plane]);
    return parseSegmentation(canonicalPlane?.segmentation);
  }

  /** Metadatos de los cortes crudos de un plano, si la corrida los publicó. */
  function slicePixelsForPlane(plane: "sagittal" | "axial"): SlicePixelsMeta | undefined {
    const canonicalPlane = asRecord(asRecord(displayRun.canonicalRun?.planes)?.[plane]);
    return parseSlicePixelsMeta(asRecord(canonicalPlane?.quality)?.slicePixels);
  }

  /** El corte que se está mirando: el navegado, o el de la IA si aún no se movió. */
  function currentSliceOf(plane: "sagittal" | "axial") {
    const series = seriesList.find((item: any) => item.plane === plane);
    const total = series?.sliceCount ?? 1;
    return clampSlice(sliceByPlane[plane] ?? series?.selectedSlice ?? 0, total);
  }

  function geometryForPlane(plane: "sagittal" | "axial") {
    const canonicalPlane = asRecord(asRecord(displayRun.canonicalRun?.planes)?.[plane]);
    return parseVolumeGeometry(asRecord(canonicalPlane?.quality)?.volumeGeometry);
  }

  /**
   * Dónde corta el otro plano a la imagen de este, si la geometría lo sostiene.
   *
   * Devuelve también el motivo cuando no se puede: una línea ausente sin explicación
   * se lee como que la función está rota, y acá la ausencia es la respuesta correcta.
   */
  function referenceLineFor(plane: "sagittal" | "axial"): { line: [{ x: number; y: number }, { x: number; y: number }] | null; reason: string } {
    const other = plane === "sagittal" ? "axial" : "sagittal";
    const target = geometryForPlane(plane);
    const source = geometryForPlane(other);
    if (!target?.slicePlane || !source?.slicePlane) {
      return { line: null, reason: "Esta corrida no tiene los dos planos con geometría." };
    }
    const evidence = coordinateEvidence(target, source);
    if (!evidence.shared) return { line: null, reason: evidence.reason };
    /*
     * Los dos planos se toman en el corte que el médico está mirando ahora, no en el
     * que analizó la IA: la línea tiene que moverse mientras recorre la serie. Con el
     * corte fijo la línea se queda quieta y se lee como que la función está rota.
     */
    const targetPlane = slicePlaneAt(target, currentSliceOf(plane));
    const sourcePlane = slicePlaneAt(source, currentSliceOf(other));
    if (!targetPlane || !sourcePlane) {
      return { line: null, reason: "El corte que se está mirando no declara su posición." };
    }
    const line = referenceLineOn(targetPlane, sourcePlane);
    if (!line) {
      // Normal en un estudio lumbar: los axiales cubren solo la parte baja.
      return { line: null, reason: `El corte ${other === "sagittal" ? "sagital" : "axial"} no cruza esta parte de la imagen.` };
    }
    return { line, reason: "" };
  }

  function masksForPlane(plane: "sagittal" | "axial"): StudyMask[] {
    const source = plane === activePlano ? masks : canonicalMasksFor(plane);
    return source.map((mask: StudyMask) => {
      const draft = contourDrafts[mask.id];
      if (!draft || !mask.contours?.length) return mask;
      return { ...mask, contours: [{ ...mask.contours[0], points: draft }] };
    });
  }

  const displayMasks = masksForPlane(activePlano);

  function moveMaskPoint(maskId: string, pointIndex: number, point: { x: number; y: number }) {
    setContourDrafts((current) => {
      const base = current[maskId] ?? masks.find((mask: StudyMask) => mask.id === maskId)?.contours?.[0]?.points;
      if (!base || pointIndex < 0 || pointIndex >= base.length) return current;
      const next = base.slice();
      next[pointIndex] = point;
      return { ...current, [maskId]: next };
    });
  }

  const activeWorkspace = activePlano === "axial" ? axialWorkspace : sagittalWorkspace;
  const overlayAvailable = overlayAvailableByPlano[activePlano] === true;
  const activeCoordinateSpace = coordinateSpaceFrom(currentSeries, displayLandmarks);
  /*
   * MriSliceViewer avisa la disponibilidad del overlay desde un efecto que depende
   * de esta callback. Si se pasa una arrow inline, su identidad cambia en cada
   * render y el efecto vuelve a ejecutarse; si además el setter devuelve siempre un
   * objeto nuevo, el estado "cambia" y el padre re-renderiza, realimentando el
   * ciclo. Ese bucle de render abortaba el AbortController del visor en cada vuelta
   * y la imagen nunca llegaba a cargarse.
   *
   * Se corta por los dos lados: identidad estable con useCallback y bail-out
   * devolviendo la misma referencia cuando el valor no cambió.
   */
  const handleOverlayAvailableChange = useCallback((available: boolean) => {
    setOverlayAvailableByPlano((current) => (current[activePlano] === available ? current : { ...current, [activePlano]: available }));
  }, [activePlano]);

  /**
   * Datos por plano para poder montar sagital y axial a la vez. Cada plano tiene su
   * propia serie, su propio modelo de visor y su propio corte: los stacks son
   * independientes y no comparten índice.
   */
  function planeViewportData(plane: "sagittal" | "axial"): { series: any; nav?: SliceNavigation } | null {
    const series = seriesList.find((item: any) => item.plane === plane);
    if (!series) return null;
    const total = series.sliceCount ?? 1;
    const aiIndex = clampSlice(series.selectedSlice ?? 0, total);
    const current = clampSlice(sliceByPlane[plane] ?? aiIndex, total);
    const nav: SliceNavigation | undefined = total > 1
      ? {
        current,
        total,
        aiIndex,
        hasImage: current === aiIndex || current < (series.slicePreviewCount ?? 0),
        previewUrl: current === aiIndex ? undefined : slicePreviewUrl(series.imageUrl, current),
        previewUrlFor: (index: number) => (index < (series.slicePreviewCount ?? 0) ? slicePreviewUrl(series.imageUrl, index) : undefined),
        onChange: (index: number) => setSliceByPlane((state) => ({ ...state, [plane]: clampSlice(index, total) })),
        onStep: (delta: number) => setSliceByPlane((state) => ({
          ...state,
          [plane]: clampSlice((state[plane] ?? aiIndex) + delta, total),
        })),
      }
      : undefined;
    return { series, nav };
  }

  const axialAvailable = seriesList.some((item: any) => item.plane === "axial");
  /** Qué planos se montan en el stage según la disposición elegida. */
  const visiblePlanes: Array<"sagittal" | "axial"> = layout === "dual" && axialAvailable
    ? ["sagittal", "axial"]
    : [activePlano];

  const viewerModel = useMemo(
    () => studyRunToMriViewerModel({
      plane: activePlano,
      planeRunId: activeWorkspace.planeRunId ?? undefined,
      series: currentSeries ?? undefined,
      masks: displayMasks,
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
  /* Una revisión ya cerrada se lee pero no se corrige. */
  const reviewLocked = (displayRun.review?.status ?? run.reviewStatus) === "aceptado";
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
  const contourDraftCount = Object.keys(contourDrafts).length;
  const hasReviewerDrafts = hasMeasurementDrafts || landmarkDraftCount > 0 || contourDraftCount > 0;
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
    setContourDrafts({});
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
      // La geometría corregida viaja con el valor; si el revisor no movió la figura,
      // la de la IA sigue siendo la que corresponde.
      points: measureGeometry[item.id] ?? item.points ?? existing?.points,
      forceCorrection: reviewerValue !== undefined && reviewerValue !== "",
    };
  }

  function currentReviewerMeasurements() {
    const existingIds = new Set(sourceMeasurements.map((item) => item.id));
    const updated = sourceMeasurements.map((item) => {
      const reviewerValue = reviewerValues[item.id];
      const geometry = measureGeometry[item.id];
      if (reviewerValue === undefined || reviewerValue === "") return geometry ? { ...item, points: geometry } : item;
      return { ...item, value: reviewerValue, reviewerValue, points: geometry ?? item.points, source: "Reviewer" as const, status: "editado" as const, forceCorrection: true };
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

  /*
   * Las anotaciones se guardan junto con la revisión y no en cada trazo: el
   * revisor mide y descarta varias veces mientras lee, y persistir cada
   * movimiento dejaría en la historia clínica pasos intermedios que él nunca
   * quiso registrar. El PUT reemplaza el conjunto completo, que es la unidad con
   * la que se editan en pantalla.
   */
  async function save(status: ReviewStatus) {
    const nextMeasurements = currentReviewerMeasurements();
    const review = await onSaveReview(status, notes, nextMeasurements);
    if (!review) return;
    const runId = displayRun.runId;
    if (runId) {
      try {
        const saved = await saveRunAnnotations(runId, annotations);
        setAnnotations(saved as Annotation[]);
        setAnnotationsError("");
      } catch (error) {
        // La revisión sí se guardó: se dice qué quedó sin persistir en vez de
        // dejar que el revisor cierre creyendo que sus marcas están a salvo.
        setAnnotationsError(error instanceof Error ? `Las anotaciones no se guardaron: ${error.message}` : "Las anotaciones no se guardaron.");
      }
    }
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
      // El detalle fresco lo vuelve a leer App en onStudyMetadataUpdated, que es
      // quien lo posee: guardarlo también acá abría una segunda copia que podía
      // quedar desincronizada de la lista de trabajo.
      await updateStudyMetadata(caseId, payload);
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
      levelScope: row.levelScope,
      value: row.reviewerValue ?? row.aiValue,
      unit: row.unit,
      confidence: row.confidence,
      outlier: row.outlier,
    }))),
    [resultRows],
  );
  const levelUnassigned = allFindingsUnassigned(levelGroups);
  const activeGroup = levelGroups.find((group: LevelGroup) => group.key === selectedLevel);
  const visibleRows = activeGroup ? resultRows.filter((row) => activeGroup.findings.some((finding) => finding.id === row.id)) : resultRows;
  /*
   * Nivel activo para anclar anotaciones de alcance "level". Es el nivel que el
   * revisor tiene seleccionado en el panel; si está mirando "sin nivel asignado"
   * no hay nivel al que anclar y esa opción queda deshabilitada.
   */
  const activeLevel: SpineLevel | null = activeGroup?.level ?? null;

  function addAnnotation(annotation: Annotation) {
    setAnnotations((current) => [...current, annotation]);
  }

  function removeAnnotation(id: string) {
    setAnnotations((current) => current.filter((item) => item.id !== id));
  }

  /** Mediciones que corresponden al corte visible de un plano, ya rotuladas. */
  function measurementOverlaysFor(plane: "sagittal" | "axial", sliceIndex: number, seriesId?: string): MeasurementOverlay[] {
    const context = { plane, seriesId, sliceIndex, level: activeLevel };
    return annotations
      // Cada figura se redibuja con la herramienta que la tomó: un ángulo son cuatro
      // puntos y una listesis tres, así que dibujarlas todas como distancias entre los
      // dos primeros mostraría mediciones que el médico nunca tomó.
      .filter((item) => item.kind === "measurement" && (item.points?.length ?? 0) >= 1 && isAnnotationVisible(item, context))
      .map((item) => ({
        id: item.id,
        kind: (item.measurementKind ?? "distance") as MeasurementKind,
        points: item.points!,
        source: "reviewer" as const,
        label: item.value !== undefined && item.unit ? formatMeasurement(item.value, item.unit) : (item.text ?? ""),
      }));
  }

  /**
   * Segmentos de las mediciones de la IA para el nivel que se está leyendo.
   *
   * Solo las del nivel seleccionado. Dibujarlas todas junto -treinta segmentos con su
   * rótulo sobre siete discos y cinco vértebras- tapa exactamente la anatomía que hay
   * que mirar: el ruido visual no es un problema estético, esconde la imagen.
   *
   * El rótulo es solo el valor. Qué estructura y qué magnitud es ya lo dice el panel
   * de la derecha, y repetirlo sobre la imagen agrega texto sin agregar información.
   *
   * El área no aparece: no tiene dos extremos, y la máscara pintada ya la muestra.
   */
  function aiMeasurementOverlaysFor(plane: "sagittal" | "axial", sliceIndex: number, derived: boolean): MeasurementOverlay[] {
    if (!activeLevel) return [];
    return resultRows
      .filter((row) => {
        if (Boolean(row.experimental) !== derived) return false;
        const points = measureGeometry[row.id] ?? row.points;
        if (!points || points.length !== 2) return false;
        if (row.sliceIndex !== undefined && row.sliceIndex !== sliceIndex) return false;
        if (row.plane && row.plane !== plane) return false;
        return row.level === activeLevel;
      })
      .map((row) => {
        const points = measureGeometry[row.id] ?? row.points!;
        const value = firstPresent(row.reviewerValue, row.aiValue);
        return {
          id: `ai-${row.id}`,
          // La figura la define la cantidad de puntos, no el nombre de la medición:
          // dos son una distancia, tres una listesis y cuatro un ángulo.
          kind: (points.length >= 4 ? "angle" : points.length === 3 ? "listhesis" : "distance") as MeasurementKind,
          measurementId: row.id,
          points,
          source: (row.experimental ? "derived" : "ai") as "ai" | "derived",
          label: `${value ?? "—"} ${displayUnit(row.unit)}`.trim(),
        };
      });
  }

  /**
   * Las mediciones del nivel que se está leyendo, de la IA y del revisor juntas.
   *
   * Van en una sola lista porque son lo mismo visto desde dos orígenes, y separarlas
   * obligaría al médico a mirar en dos lados para saber qué se midió en L4-L5.
   */
  const panelRows: PanelRow[] = [
    ...visibleRows.map((row) => ({
      id: row.id,
      labelKey: row.label,
      label: row.label,
      unit: row.unit,
      aiValue: row.aiValue,
      reviewerValue: row.reviewerValue === "" ? null : row.reviewerValue,
      measurable: Boolean((measureGeometry[row.id] ?? row.points)?.length),
      source: "ai" as const,
      detail: [row.experimental ? "derivada" : "", row.detail ?? ""].filter(Boolean).join(" · ") || undefined,
    })),
    ...annotations
      .filter((item) => item.kind === "measurement" && (!activeLevel || item.level === activeLevel))
      .map((item) => ({
        id: item.id,
        labelKey: item.measurementKind ?? "distance",
        label: item.text || TOOL_LABELS[(item.measurementKind ?? "distance") as MeasurementKind].name,
        unit: item.unit ?? "",
        aiValue: undefined,
        reviewerValue: item.value ?? null,
        measurable: (item.points?.length ?? 0) >= 1,
        source: "reviewer" as const,
      })),
  ];

  /** Cuántas mediciones tiene dibujables el nivel activo, para el panel de capas. */
  const aiMeasurableCount = resultRows.filter((row) => !row.experimental && (measureGeometry[row.id] ?? row.points)?.length).length;
  /** Derivadas de otras estructuras: van en su propia capa, apagada por defecto. */
  const derivedMeasurableCount = resultRows.filter((row) => row.experimental && (measureGeometry[row.id] ?? row.points)?.length).length;

  /**
   * Arrastrar un extremo recalcula la medición desde la geometría nueva.
   *
   * El valor pasa a ser el del revisor y el de la IA queda intacto al lado. Escribir
   * el número en la tabla hace lo mismo con el valor pero no puede mover la línea:
   * solo arrastrando vuelven a coincidir.
   */
  function moveMeasurePoint(
    measurementId: string,
    end: "from" | "to",
    point: { x: number; y: number },
    frame: { width: number; height: number },
    spacing?: number[] | null,
  ) {
    const row = resultRows.find((item) => item.id === measurementId);
    const current = measureGeometry[measurementId] ?? row?.points;
    if (!current || current.length !== 2) return;
    const next = end === "from" ? [point, current[1]] : [current[0], point];
    setMeasureGeometry((state) => ({ ...state, [measurementId]: next }));
    const { value } = measureDistance(next[0], next[1], frame, spacing);
    setReviewerValues((state) => ({ ...state, [measurementId]: value.toFixed(2) }));
  }

  /**
   * Cierra una medición del revisor y la guarda.
   *
   * El valor sale de `recomputeValue`, que es el mismo camino por el que se recalcula
   * al arrastrar un extremo: así una medición recién tomada y una corregida no pueden
   * diferir por la vía que las produjo.
   *
   * La sonda y el ROI necesitan además los píxeles originales del corte. Si no
   * llegaron —una corrida vieja no los guardó— la medición no se toma en vez de
   * informar una intensidad sacada del PNG ya ventaneado, que describiría cómo se ve
   * la imagen y no lo que el equipo midió.
   */
  function commitMeasurement(
    kind: MeasurementKind,
    points: { x: number; y: number }[],
    frame: { width: number; height: number },
    plane: "sagittal" | "axial",
    data: { series: StudySeries; nav?: SliceNavigation },
    pixels: RawSlicePixels | null,
  ) {
    const spacing = data.series.inPlaneSpacingMm;
    const sliceIndex = data.nav?.current ?? data.series.selectedSlice ?? 0;
    let value: number | undefined;
    let unit: "mm" | "px" | undefined;
    let text = "";

    if (kind === "probe" || kind === "roi") {
      if (!pixels) {
        setAnnotationsError("Esta corrida no guardó las intensidades originales del corte, así que no se puede medir señal.");
        return;
      }
      if (kind === "probe") {
        const intensity = probeIntensity(points[0], pixels.data, pixels.meta);
        if (intensity === null) return;
        text = `Intensidad ${Math.round(intensity)} (unidades arbitrarias, no comparables entre estudios)`;
      } else {
        const stats = intensityStats(points, pixels.data, pixels.meta);
        const area = polygonArea(points, frame, spacing);
        if (!stats || !area) return;
        value = area.value;
        unit = area.unit === "mm2" ? "mm" : "px";
        text = `Área ${formatMeasurementValue(area.value, area.unit)} · señal ${Math.round(stats.mean)} ± ${Math.round(stats.deviation)} (unidades arbitrarias)`;
      }
    } else {
      const computed = recomputeValue(kind, points, frame, spacing);
      if (!computed) return;
      value = computed.value;
      unit = computed.unit === "mm" || computed.unit === "px" ? computed.unit : undefined;
      text = `${TOOL_LABELS[kind].name} ${formatMeasurementValue(computed.value, computed.unit)}${computed.detail ? ` · ${computed.detail}` : ""}`;
    }

    addAnnotation({
      id: `measure-${Date.now()}`,
      scope: "slice",
      kind: "measurement",
      measurementKind: kind,
      plane,
      seriesId: data.series.id,
      sliceIndex,
      level: activeLevel ?? undefined,
      points,
      value,
      unit,
      text,
      author: reviewerName,
      createdAt: new Date().toISOString(),
    });
    setAnnotationsError("");
  }

  const caseLabel = displayRun.caseId ?? studyReview?.caseId ?? "Caso sin identificador";
  const subjectLabel = displaySubjectRef(selectedDetail?.study?.subjectRef ?? run.patientId ?? null);
  // La esquina del viewport muestra el corte que se está mirando, no el que analizó
  // la IA: es el índice de referencia mientras se recorre el stack.

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
          {/*
            1×2 solo se ofrece cuando el estudio trae axial: sin axial la mitad
            inferior quedaría vacía y el control prometería una comparación que
            no existe.
          */}
          <div className="rr-layout-picker" role="group" aria-label="Disposición del visor">
            <button className={layout === "single" ? "is-active" : ""} onClick={() => setLayout("single")} type="button" title="Un plano a pantalla completa">1×1</button>
            <button
              className={layout === "dual" ? "is-active" : ""}
              disabled={!axialAvailable}
              onClick={() => setLayout("dual")}
              title={axialAvailable ? "Sagital y axial simultáneos" : "El estudio no tiene plano axial persistido"}
              type="button"
            >
              1×2
            </button>
          </div>
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
                <SeriesThumbnail url={item.imageUrl} index={index} />
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

        <main className="rr-stage" data-layout={layout}>
          {tab === "3D Reconstruction" ? (
            <div className="rr-viewport"><SpineReconstructionPreview proxy={threeDProxyViewModel} /></div>
          ) : (
            visiblePlanes.map((planeName) => {
              const data = planeViewportData(planeName);
              if (!data) return null;
              const workspace = planeName === "axial" ? axialWorkspace : sagittalWorkspace;
              return (
                <PlaneViewport
                  key={planeName}
                  plane={planeName}
                  caseLabel={caseLabel}
                  seriesName={data.series.name}
                  model={studyRunToMriViewerModel({
                    plane: planeName,
                    planeRunId: workspace.planeRunId ?? undefined,
                    series: data.series,
                    masks: masksForPlane(planeName),
                    landmarks: displayLandmarks,
                  })}
                  modelLabel={displayRun.modelVersion ?? modelArtifact?.version ?? displayModelKey(displayRun.modelKey)}
                  inferenceLabel={inferenceModeLabel(inferenceMode)}
                  spacingLabel={quality?.pixelSpacingMm ? `${quality.pixelSpacingMm} mm/px` : "escala no informada"}
                  slice={data.nav}
                  active={activePlano === planeName}
                  onActivate={() => selectSeries(data.series)}
                  selectedLandmarkId={selectedLandmark}
                  onSelectLandmark={setSelectedLandmark}
                  readonly={!editMode || activePlano !== planeName}
                  addMode={landmarkAddMode && activePlano === planeName}
                  onMoveLandmark={(landmarkId, point) => {
                    const landmark = displayLandmarks.find((item) => item.id === landmarkId);
                    if (!landmark) return;
                    updateLandmarkDraft({ ...landmark, x: point.x, y: point.y, editable: true });
                  }}
                  onAddLandmark={(point) => {
                    updateLandmarkDraft({
                      id: `reviewer-landmark-${Date.now()}`,
                      label: `R${displayLandmarks.length + 1}`,
                      seriesId: data.series.id,
                      sliceIndex: data.nav?.current ?? data.series.selectedSlice ?? 1,
                      x: point.x,
                      y: point.y,
                      editable: true,
                    });
                  }}
                  onLandmarkAddComplete={() => setLandmarkAddMode(false)}
                  onOverlayAvailableChange={handleOverlayAvailableChange}
                  measureTool={activePlano === planeName ? measureTool.tool : null}
                  measureDraft={measureTool.points}
                  onMeasurePoint={(point, frame, pixels) => {
                    const closed = measureTool.addPoint(point);
                    if (closed) commitMeasurement(closed.kind, closed.points, frame, planeName, data, pixels);
                  }}
                  onMeasureFreehand={(points, frame, pixels) => {
                    const closed = measureTool.closeFreehand(points);
                    if (closed) commitMeasurement(closed.kind, closed.points, frame, planeName, data, pixels);
                  }}
                  annotations={measurementOverlaysFor(planeName, data.nav?.current ?? data.series.selectedSlice ?? 0, data.series.id)}
                  aiMeasurements={aiMeasurementOverlaysFor(planeName, data.nav?.current ?? data.series.selectedSlice ?? 0, false)}
                  aiMeasurableCount={aiMeasurableCount}
                  referenceLine={referenceLineFor(planeName).line}
                  referenceLineReason={referenceLineFor(planeName).reason}
                  derivedMeasurements={aiMeasurementOverlaysFor(planeName, data.nav?.current ?? data.series.selectedSlice ?? 0, true)}
                  derivedMeasurableCount={derivedMeasurableCount}
                  highlightedMeasurementId={highlightedMeasurementId ? `ai-${highlightedMeasurementId}` : null}
                  onSelectMeasurement={(id) => setSelectedMeasurementId(id.startsWith("ai-") ? id.slice(3) : id)}
                  selectedMeasurementId={selectedMeasurementId ? `ai-${selectedMeasurementId}` : null}
                  onMoveMeasurePoint={(measurementId, end, point, frame) => moveMeasurePoint(measurementId, end, point, frame, data.series.inPlaneSpacingMm)}
                  annotatedIndices={annotatedSlices(annotations, planeName)}
                  onMoveMaskPoint={moveMaskPoint}
                  segmentation={segmentationForPlane(planeName)}
                  slicePixels={slicePixelsForPlane(planeName)}
                  pixelsBaseUrl={data.series.imageUrl ?? undefined}
                  hiddenInstances={hiddenInstances[planeName] ?? []}
                  onToggleInstance={(index) => setHiddenInstances((current) => {
                    const list = current[planeName] ?? [];
                    return {
                      ...current,
                      [planeName]: list.includes(index) ? list.filter((item) => item !== index) : [...list, index],
                    };
                  })}
                />
              );
            })
          )}
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
                    const key = group.key;
                    const active = selectedLevel === key;
                    return (
                      <button
                        key={key}
                        className={`rr-level rr-level-${group.kind}${active ? " is-active" : ""}${group.findings.length ? "" : " is-empty"}`}
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
                    Ninguna medición de esta corrida pudo atribuirse a un nivel vertebral. Se listan
                    sin nivel asignado en vez de repartirlas por suposición.
                  </p>
                )}

                <p className="rr-section-title">
                  Mediciones{activeGroup ? ` · ${activeGroup.label}` : ""}
                </p>
                {/*
                  La fila y la cota son la misma medición vista de dos maneras, así que
                  se comportan como una sola: pasar el mouse por la fila resalta su
                  línea, y tocarla la elige. Sin eso, con tres cotas sobre el mismo
                  disco no hay forma de saber cuál corresponde a cuál número.
                */}
                <MeasurementPanel
                  emptyNote={hasPlaneWorkspaces && !persistedMeasurements.length
                    ? `La serie ${activePlano === "axial" ? "axial" : "sagital"} de este estudio no aporta mediciones. Cambiá de plano o medí a mano.`
                    : undefined}
                  onChangeValue={(row, value) => {
                    if (row.source === "reviewer") return;
                    const measurement = resultRows.find((item) => item.id === row.id);
                    if (measurement) updateReviewerValue(measurement, value);
                  }}
                  onDelete={removeAnnotation}
                  onHighlight={setHighlightedMeasurementId}
                  onSelect={setSelectedMeasurementId}
                  readonly={reviewLocked}
                  rows={panelRows}
                  selectedId={selectedMeasurementId}
                />

                <p className="rr-section-title">Anotaciones</p>
                {/*
                  El alcance se elige al escribir, no después: una observación del
                  estudio y una acotada a un corte se leen igual en una lista plana,
                  y sin el alcance explícito la anotación pierde el contexto que la
                  hace interpretable.
                */}
                <div className="rr-annot-new">
                  <div className="rr-annot-scopes" role="group" aria-label="Alcance de la anotación">
                    <button className={noteScope === "study" ? "is-active" : ""} onClick={() => setNoteScope("study")} type="button">Estudio</button>
                    <button
                      className={noteScope === "level" ? "is-active" : ""}
                      disabled={!activeLevel}
                      onClick={() => setNoteScope("level")}
                      title={activeLevel ? `Anclar a ${activeLevel}` : "Seleccioná un nivel en la lista de arriba"}
                      type="button"
                    >
                      {activeLevel ?? "Nivel"}
                    </button>
                    <button className={noteScope === "slice" ? "is-active" : ""} onClick={() => setNoteScope("slice")} type="button">
                      Corte {(sliceByPlane[activePlano] ?? currentSeries?.selectedSlice ?? 0) + 1}
                    </button>
                  </div>
                  <textarea
                    aria-label="Texto de la anotación"
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Observación del revisor…"
                    value={noteDraft}
                  />
                  <button
                    className="rr-ghost"
                    disabled={!noteDraft.trim()}
                    onClick={() => {
                      const sliceIndex = sliceByPlane[activePlano] ?? currentSeries?.selectedSlice ?? 0;
                      addAnnotation({
                        id: `note-${Date.now()}`,
                        scope: noteScope,
                        kind: "note",
                        plane: noteScope === "slice" ? activePlano : undefined,
                        seriesId: noteScope === "slice" ? currentSeries?.id : undefined,
                        sliceIndex: noteScope === "slice" ? sliceIndex : undefined,
                        level: noteScope === "level" ? activeLevel ?? undefined : undefined,
                        text: noteDraft.trim(),
                        author: reviewerName,
                        createdAt: new Date().toISOString(),
                      });
                      setNoteDraft("");
                    }}
                    type="button"
                  >
                    Agregar
                  </button>
                </div>

                {annotations.length ? (
                  <ul className="rr-annots">
                    {annotations.map((item) => (
                      <li className="rr-annot" key={item.id}>
                        <span className="rr-annot-scope">{displayAnnotationScope(item)}</span>
                        <span className="rr-annot-body">
                          {item.kind === "measurement" && item.value !== undefined && item.unit
                            ? formatMeasurement(item.value, item.unit)
                            : item.text}
                          {item.kind === "measurement" && item.unit === "px" && (
                            <em> · la corrida no informó escala física</em>
                          )}
                        </span>
                        <button aria-label="Eliminar anotación" className="rr-annot-del" onClick={() => removeAnnotation(item.id)} type="button">×</button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="rr-note">Sin anotaciones del revisor.</p>}
                {annotationsError
                  ? <p className="rr-note rr-note-warn">{annotationsError}</p>
                  : <p className="rr-note">Se guardan junto con la revisión.</p>}
              </>
            )}

            {panelTab === "review" && (
              <>
                {/*
                  Las mediciones se corrigen en Hallazgos, sobre la fila que además
                  resalta su cota en la imagen. Acá había una segunda lista con las
                  cuarenta y tres de la corrida y un campo por cada una, sin nivel y
                  sin imagen: dos lugares para lo mismo, y el que no mostraba la
                  anatomía era justamente el que dejaba escribir.
                */}
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
        {/*
          Medir no depende del espacio de coordenadas de la IA: es geometría propia
          del revisor sobre la imagen. Sí depende del corte visible, que es a lo que
          la medición queda anclada.
        */}
        {(Object.keys(TOOL_LABELS) as MeasurementKind[]).map((kind) => (
          <button
            className={`rr-tool${measureTool.tool === kind ? " is-active" : ""}`}
            key={kind}
            onClick={() => { measureTool.select(kind); setLandmarkAddMode(false); }}
            title={TOOL_LABELS[kind].hint}
            type="button"
          >
            {TOOL_LABELS[kind].name}
          </button>
        ))}
        <span className="rr-toolbar-sep" aria-hidden />
        <button className="rr-tool" disabled={!hasReviewerDrafts} onClick={resetReviewerDrafts} title={hasReviewerDrafts ? "Descartar borradores del revisor" : "No hay borradores"} type="button">
          Deshacer
        </button>
        <button className="rr-tool" disabled={!hasMeasurementDrafts} onClick={() => setReviewerValues({})} title={hasMeasurementDrafts ? "Volver a los valores persistidos" : "No hay mediciones editadas"} type="button">
          Restaurar mediciones
        </button>

        <span className="rr-toolbar-end">
          {hasReviewerDrafts ? <span>{reviewerDraftCount} med · {landmarkDraftCount} lm · {contourDraftCount} contornos en borrador</span> : null}
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
