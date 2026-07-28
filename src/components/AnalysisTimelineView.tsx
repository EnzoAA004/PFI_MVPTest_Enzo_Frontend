import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { API_BASE_URL } from "../api";
import { BackendApiError, aiAssetUrl, fetchThreeDProxyAsset, getMultiplanarContract, runMultiplanarAnalysis, submitRunReview, uploadAiInput } from "../multiplanarApi";
import type { Measurement, Plane } from "../appTypes";
import type { CanonicalAssetName, CanonicalMultiplanarRun, CanonicalPlaneRun } from "../contracts/canonicalMultiplanarRun";
import type { InputResponse } from "../contracts/inputApiTypes";
import type { RunReviewStatus } from "../contracts/reviewApiTypes";
import type { MultiplanarRunPayload } from "../contracts/multiplanarHttpTypes";
import type { MultiplanarContract } from "../multiplanarTypes";
import { abbreviateArtifactHash, evaluateAxialReadiness, evaluateDualReadiness, evaluateRealInferenceReadiness, evaluateSagittalReadiness, evaluateSagittalReviewReadiness, readSpiderRuntimeMetadata, resolvePlaneAssetUrls, resolvePlaneInferenceMode, resolveReviewWorkspaceMode, resolveWorkspaceInferenceMode, SAGITTAL_FINAL_ARTIFACT_HASH, SAGITTAL_FINAL_MODEL_VERSION } from "../inferenceReadiness";
import { getPlane, getPlaneMasks, getPlaneMeasurements } from "../selectors/canonicalRunSelectors";
import { canonicalMeasurementToViewMeasurement } from "../viewModels/measurementViewModel";
import { canonicalPlaneToMriViewerModel } from "../viewModels/mriViewerViewModel";
import { canonicalThreeDToProxyViewModel, type ThreeDProxyAssetFetchState } from "../viewModels/threeDProxyViewModel";
import { parseThreeDProxyMeshAsset, ThreeDProxyAssetError } from "../adapters/threeDProxyAssetParser";
import { AgentSummary } from "./AgentSummary";
import { MeasurementsPanel } from "./MeasurementsPanel";
import { MriSliceViewer } from "./MriSliceViewer";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";
import { StatusBadge } from "./StatusBadge";
import { emptyStudyMetadataDraft, normalizeStudyMetadataInput, subjectRefErrorMessage, validateSubjectRef, type StudyMetadataDraft } from "../studyMetadata";

const uploadPlanes: Plane[] = ["sagittal", "axial"];
const allowedInputExtensions = [".npy", ".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".mha", ".mhd", ".dcm"];
const uploadAccept = allowedInputExtensions.join(",");
const reviewStatuses: RunReviewStatus[] = ["accepted", "observed", "rejected", "edited"];

type Step = 1 | 2 | 3 | 4;
type UploadState = {
  fileName?: string;
  status: "idle" | "uploading" | "uploaded" | "error";
  input?: InputResponse;
  error?: string;
};

const emptyUploads: Record<Plane, UploadState> = {
  sagittal: { status: "idle" },
  axial: { status: "idle" },
};

function planeLabel(plane: Plane) {
  return plane === "sagittal" ? "Sagital" : "Axial";
}

/**
 * Coordinated 2D/3D selection (P9-C.5 gap closure): the experimental 3D proxy
 * groups faces by the sagittal class key (e.g. "vertebra_group", "canal",
 * "disc_group" — see AI Module P9-A.3.1 structures[].label). Sagittal
 * landmarks use the same key as a prefix of their labelKey (e.g.
 * "vertebra_group_centroid"). This derives that shared key so selecting one
 * can highlight the other; it never invents anatomy, it only reuses an
 * identifier that already exists verbatim in both places.
 */
export function structureKeyForLandmarkLabelKey(labelKey: string | undefined): string | null {
  if (!labelKey) return null;
  const match = labelKey.match(/^(vertebra_group|canal|disc_group)/);
  return match ? match[1] : null;
}

function hasAllowedExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  return allowedInputExtensions.some((extension) => lower.endsWith(extension));
}

function reviewStatusLabel(status: RunReviewStatus) {
  if (status === "accepted") return "aceptado";
  if (status === "observed") return "observado";
  if (status === "rejected") return "rechazado";
  return "editado";
}

function apiErrorMessage(error: unknown, action: string) {
  if (error instanceof BackendApiError) {
    if (error.status === 408 || error.status === 504) return "La inferencia agotó el tiempo de espera.";
    if (error.status >= 500 && error.message.toLowerCase().includes("connect")) return "El Backend no pudo conectarse con el AI Module.";
    if (error.code === "AI_MULTIPLANAR_CONTRACT_VIOLATION" || error.code === "AI_CONTRACT_VIOLATION") return error.message;
    return `${error.message} al ${action}. Código ${error.status}. Trace ${error.traceId ?? "no informado"}.`;
  }
  if (error instanceof Error) return error.message;
  return `No se pudo ${action}.`;
}

function measurementsFromRun(run: CanonicalMultiplanarRun | null): Measurement[] {
  if (!run?.planes) return [];
  return uploadPlanes.flatMap((plane) => getPlaneMeasurements(run, plane).map((row, index) => canonicalMeasurementToViewMeasurement(row, plane, index)));
}

function percentLabel(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(2).replace(".", ",")} %` : "no informado";
}

function sagittalForegroundConfidence(run: CanonicalMultiplanarRun | null) {
  const quality = getPlane(run, "sagittal")?.quality as Record<string, unknown> | undefined;
  return quality?.meanForegroundConfidence ?? quality?.foregroundMeanConfidence ?? quality?.foregroundConfidence ?? quality?.meanMaskConfidence;
}

export function reviewCorrectionsFrom(measurements: Measurement[]) {
  return measurements
    .filter((measurement) => measurement.source === "Reviewer" || measurement.status === "editado")
    .map((measurement) => {
      const aiValue = measurement.aiValue ?? measurement.value;
      const reviewerValue = measurement.reviewerValue ?? measurement.value;
      const labelKey = measurement.labelKey ?? measurement.label;
      return {
        measurementId: measurement.id,
        labelKey,
        // El DTO legacy de revisión todavía solo admite "label"; se envía la
        // clave canónica (labelKey) en ese campo temporalmente, nunca el
        // texto traducido al español.
        label: labelKey,
        beforeValue: { value: aiValue, unit: measurement.unit },
        afterValue: { value: reviewerValue, unit: measurement.unit },
        comment: "Corrección desde timeline FE-P5",
      };
    });
}

export function reviewPayloadReady(run: CanonicalMultiplanarRun | null, reviewer: string) {
  return Boolean(run && evaluateSagittalReviewReadiness(run).ready && reviewer.trim());
}

function fallbackReason(run: CanonicalMultiplanarRun | null, contract: MultiplanarContract | null) {
  if (!run) return "";
  const readiness = evaluateRealInferenceReadiness(run);
  const contractReadiness = uploadPlanes.map((plane) => `${plane}: ${contract?.planes?.[plane]?.readiness ?? "sin contrato"}`).join(" · ");
  return readiness.reasons.length ? `${readiness.reasons.join(" ")} Preparación: ${contractReadiness}.` : `Preparación insuficiente. ${contractReadiness}.`;
}

function planeRunStatus(run: CanonicalMultiplanarRun | null, plane: Plane) {
  const result = plane === "sagittal" ? evaluateSagittalReadiness(run) : evaluateAxialReadiness(run);
  return {
    result,
    mode: resolvePlaneInferenceMode(getPlane(run, plane)) ?? "no informado",
  };
}

function allowedAssetValue(url: string | undefined) {
  if (!url) return "no disponible";
  if (url.includes("mask.npy") || url.includes("confidence.npy")) return "bloqueado";
  return url;
}

function assetRows(planeRun: CanonicalPlaneRun | undefined, plane: Plane) {
  const urls = resolvePlaneAssetUrls(planeRun, plane, aiAssetUrl, API_BASE_URL);
  return (["input.png", "overlay.png", "mask-preview.png"] as CanonicalAssetName[]).map((assetName) => ({
    assetName,
    url: allowedAssetValue(urls[assetName]),
  }));
}

function ProvenancePanel({ run }: { run: CanonicalMultiplanarRun | null }) {
  const sagittal = getPlane(run, "sagittal");
  const metadata = readSpiderRuntimeMetadata(sagittal);
  const sagittalReadiness = evaluateSagittalReadiness(run);
  const artifactHash = sagittal?.model.artifactHash;
  const spacing = metadata.inPlaneSpacing?.length ? `${metadata.inPlaneSpacing.join(" x ")} mm` : "no informado";
  const nativeShape = metadata.inputShapeNative?.length ? `[${metadata.inputShapeNative.join(",")}]` : "no informado";
  const canonicalShape = metadata.inputShapeCanonical?.length ? `[${metadata.inputShapeCanonical.join(",")}]` : "no informado";
  return (
    <section className="panel-card compact-card analysis-panel">
      <div className="section-title">
        <h2>Provenance técnica de inferencia</h2>
        <StatusBadge tone={sagittalReadiness.ready ? "green" : "amber"}>{sagittalReadiness.ready ? "sagital final" : "incompleta"}</StatusBadge>
      </div>
      <p className="muted compact-copy">Evaluación técnica del runtime; no es validación clínica.</p>
      <dl className="settings-details">
        <div><dt>Modelo</dt><dd>{sagittal?.model.key ?? "no informado"}</dd></div>
        <div><dt>Versión</dt><dd>{sagittal?.model.version ?? "no informado"}</dd></div>
        <div><dt>Huella</dt><dd title={artifactHash}>{abbreviateArtifactHash(artifactHash)}</dd></div>
        <div><dt>Modo efectivo</dt><dd>{resolvePlaneInferenceMode(sagittal) ?? "no informado"}</dd></div>
        <div><dt>inputId</dt><dd>{sagittal?.input.inputId ?? "no informado"}</dd></div>
        <div><dt>Corte</dt><dd>{metadata.selectedSlice ?? "no informado"}</dd></div>
        <div><dt>Eje</dt><dd>{metadata.selectedAxis ?? "no informado"}</dd></div>
        <div><dt>Slices</dt><dd>{metadata.sliceCount ?? "no informado"}</dd></div>
        <div><dt>Transformación</dt><dd>{metadata.inputOrientationTransform ?? "no informado"}</dd></div>
        <div><dt>Spacing</dt><dd>{spacing}</dd></div>
        <div><dt>Revisión humana</dt><dd>{String(sagittal?.humanReviewRequired ?? run?.humanReviewRequired ?? "no informado")}</dd></div>
        <div><dt>No diagnóstico clínico</dt><dd>{String(sagittal?.notClinicalDiagnosis ?? run?.notClinicalDiagnosis ?? "no informado")}</dd></div>
      </dl>
      {metadata.spiderShapeDetected && <p className="settings-persistence-note">Runtime SPIDER: forma nativa {nativeShape}, forma canónica {canonicalShape}, eje {metadata.selectedAxis}, {metadata.sliceCount} cortes, transformación {metadata.inputOrientationTransform}.</p>}
      {sagittal?.model.version && sagittal.model.version !== SAGITTAL_FINAL_MODEL_VERSION && <p className="delta-alert">La versión o huella del modelo sagital no coincide.</p>}
      {artifactHash && artifactHash !== SAGITTAL_FINAL_ARTIFACT_HASH && <p className="delta-alert">La versión o huella del modelo sagital no coincide.</p>}
    </section>
  );
}

function TechnicalStatusPanel({ run }: { run: CanonicalMultiplanarRun | null }) {
  const sagittal = planeRunStatus(run, "sagittal");
  const axial = planeRunStatus(run, "axial");
  const dual = evaluateDualReadiness(run);
  const axialExperimental = !axial.result.ready;
  return (
    <section className="panel-card compact-card analysis-panel">
      <div className="section-title">
        <h2>Evaluación técnica del runtime</h2>
        <StatusBadge tone={sagittal.result.ready ? "green" : "amber"}>{sagittal.result.ready ? "sagital revisable" : "sagital bloqueado"}</StatusBadge>
      </div>
      <dl className="settings-details">
        <div><dt>Sagital</dt><dd>{sagittal.result.ready ? "real disponible" : "no disponible"} · obligatorio y principal · {sagittal.mode}</dd></div>
        <div><dt>Axial</dt><dd>{axial.result.ready ? "real disponible" : "candidate_below_quality_gate"} · uso experimental · revisión humana requerida · semántica raw_* pendiente</dd></div>
        <div><dt>Workspace dual</dt><dd>{dual.ready ? "disponible" : "bloqueado"} · {resolveWorkspaceInferenceMode(run) ?? "no informado"}</dd></div>
      </dl>
      {axialExperimental && <div className="panel-hidden-placeholder"><strong>Axial experimental.</strong><span>{axial.result.reasons.join(" ") || "Plano axial opcional no disponible."}</span></div>}
      {!dual.ready && <div className="panel-hidden-placeholder"><strong>Workspace dual bloqueado.</strong><span>{dual.reasons.join(" ")}</span></div>}
    </section>
  );
}

function AssetProvenancePanel({ run }: { run: CanonicalMultiplanarRun | null }) {
  if (!run?.planes) return null;
  return (
    <section className="panel-card compact-card analysis-panel">
      <div className="section-title"><h2>Assets proxy del Backend</h2><StatusBadge tone="blue">sin rutas internas</StatusBadge></div>
      <dl className="settings-details">
        {uploadPlanes.flatMap((plane) => assetRows(getPlane(run, plane), plane).map((asset) => (
          <div key={`${plane}-${asset.assetName}`}><dt>{planeLabel(plane)} {asset.assetName}</dt><dd>{asset.url}</dd></div>
        )))}
      </dl>
    </section>
  );
}

export type AnalysisTimelineViewProps = {
  reviewerName?: string;
  onViewSavedStudy?: (caseId: string) => void | Promise<void>;
  onBackToStudies?: () => void;
};

export function AnalysisTimelineView({ reviewerName, onViewSavedStudy, onBackToStudies }: AnalysisTimelineViewProps) {
  const [activeStep, setActiveStep] = useState<Step>(1);
  const [caseId, setCaseId] = useState("");
  const [studyMetadata, setStudyMetadata] = useState<StudyMetadataDraft>(() => emptyStudyMetadataDraft());
  const [studyMetadataError, setStudyMetadataError] = useState("");
  const [contract, setContract] = useState<MultiplanarContract | null>(null);
  const [uploads, setUploads] = useState<Record<Plane, UploadState>>(emptyUploads);
  const [run, setRun] = useState<CanonicalMultiplanarRun | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [reviewStatus, setReviewStatus] = useState<RunReviewStatus>("edited");
  const [reviewer, setReviewer] = useState(reviewerName ?? "");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [loadingContract, setLoadingContract] = useState(false);
  const [running, setRunning] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [evaluationVisited, setEvaluationVisited] = useState(false);
  const [selectedSagittalLandmark, setSelectedSagittalLandmark] = useState("");
  const [selectedAxialLandmark, setSelectedAxialLandmark] = useState("");
  const [sagittalOverlayAvailable, setSagittalOverlayAvailable] = useState(false);
  const [navigatingToSavedStudy, setNavigatingToSavedStudy] = useState(false);
  const [threeDAssetState, setThreeDAssetState] = useState<ThreeDProxyAssetFetchState>({ status: "idle" });
  const [selectedStructureLabel, setSelectedStructureLabel] = useState<string | null>(null);
  const runInFlightRef = useRef(false);

  const normalizedCaseId = caseId.trim();
  const sagittalPlaneRun = getPlane(run, "sagittal");
  const sagittalUploadReady = Boolean(normalizedCaseId && uploads.sagittal.input?.inputId);
  const axialUploadReady = Boolean(uploads.axial.input?.inputId);
  const sagittalRunReady = evaluateSagittalReadiness(run);
  const sagittalReviewReady = evaluateSagittalReviewReadiness(run);
  const axialRunReady = evaluateAxialReadiness(run);
  const dualRunReady = evaluateDualReadiness(run);
  const realInferenceReady = sagittalReviewReady.ready;
  const workspaceMode = resolveReviewWorkspaceMode(run);
  const sagittalRows = getPlaneMeasurements(run, "sagittal");
  const sagittalMasks = getPlaneMasks(run, "sagittal");
  const sagittalViewerModel = useMemo(() => (sagittalPlaneRun ? canonicalPlaneToMriViewerModel(sagittalPlaneRun) : null), [sagittalPlaneRun]);
  const sagittalMetadata = readSpiderRuntimeMetadata(sagittalPlaneRun);
  const sagittalArtifactHash = sagittalPlaneRun?.model.artifactHash;
  const axialPlaneRun = getPlane(run, "axial");
  const axialViewerModel = useMemo(() => (axialPlaneRun ? canonicalPlaneToMriViewerModel(axialPlaneRun) : null), [axialPlaneRun]);
  const axialRows = getPlaneMeasurements(run, "axial");
  const threeDProxyViewModel = useMemo(
    () => canonicalThreeDToProxyViewModel(run?.threeD, threeDAssetState, run?.humanReviewRequired ?? null),
    [run?.threeD, run?.humanReviewRequired, threeDAssetState],
  );
  const foregroundConfidence = percentLabel(sagittalForegroundConfidence(run));
  const canOpenStep: Record<Step, boolean> = {
    1: true,
    2: sagittalUploadReady,
    3: sagittalUploadReady && realInferenceReady,
    4: sagittalUploadReady && realInferenceReady && evaluationVisited,
  };
  const agentDecision = useMemo(() => ({
    status: realInferenceReady ? "borrador_revisable" : "inferencias_no_disponibles",
    priority: "media" as const,
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    recommendedAction: realInferenceReady ? "Revisar metricas tecnicas, resumen del agente y confirmar o editar el reporte." : "Esperar inferencia real sagital del backend antes de evaluar mediciones.",
    flags: realInferenceReady ? ["Inferencia sagital real completada", "Revision profesional obligatoria", "No apto para diagnostico clinico"] : ["sin inferencia real sagital"],
    reasons: realInferenceReady
      ? [
        `${sagittalMasks.length} clases presentes.`,
        `${sagittalRows.length} metricas tecnicas generadas.`,
        `Confianza media de foreground: ${foregroundConfidence}.`,
        "Axial no cargado; no bloquea la revision sagital.",
      ]
      : [fallbackReason(run, contract) || "Sin corrida sagital real disponible."],
  }), [contract, foregroundConfidence, realInferenceReady, run, sagittalMasks.length, sagittalRows.length]);

  useEffect(() => {
    setReviewer(reviewerName ?? "");
  }, [reviewerName]);

  function loadContract() {
    setLoadingContract(true);
    setMessage("");
    getMultiplanarContract()
      .then(setContract)
      .catch((error) => setMessage(apiErrorMessage(error, "consultar contrato multiplanar")))
      .finally(() => setLoadingContract(false));
  }

  useEffect(() => {
    loadContract();
  }, []);

  useEffect(() => {
    if (run) setMeasurements(measurementsFromRun(run));
  }, [run]);

  const threeDMeshAssetUrl = run?.threeD?.enabled ? run.threeD.assets.find((asset) => asset.assetName.endsWith(".json"))?.url : undefined;

  async function loadThreeDAsset(url: string) {
    setThreeDAssetState({ status: "loading" });
    try {
      const raw = await fetchThreeDProxyAsset(url);
      const asset = parseThreeDProxyMeshAsset(raw);
      setThreeDAssetState({ status: "loaded", asset });
    } catch (error) {
      if (error instanceof ThreeDProxyAssetError) {
        setThreeDAssetState({ status: "invalid" });
      } else if (error instanceof BackendApiError) {
        setThreeDAssetState({ status: "error", traceId: error.traceId });
      } else {
        setThreeDAssetState({ status: "error" });
      }
    }
  }

  useEffect(() => {
    if (!threeDMeshAssetUrl) {
      setThreeDAssetState({ status: "idle" });
      return;
    }
    void loadThreeDAsset(threeDMeshAssetUrl);
  }, [threeDMeshAssetUrl]);

  function retryThreeDAsset() {
    if (threeDMeshAssetUrl) void loadThreeDAsset(threeDMeshAssetUrl);
  }

  function handleSelectSagittalLandmark(landmarkId: string) {
    setSelectedSagittalLandmark(landmarkId);
    const landmark = sagittalPlaneRun?.landmarks.find((item) => (item.id ?? item.labelKey) === landmarkId);
    setSelectedStructureLabel(structureKeyForLandmarkLabelKey(landmark?.labelKey));
  }

  function handleSelectStructure(label: string | null) {
    setSelectedStructureLabel(label);
    const matchingLandmark = label
      ? sagittalPlaneRun?.landmarks.find((item) => structureKeyForLandmarkLabelKey(item.labelKey) === label)
      : undefined;
    setSelectedSagittalLandmark(matchingLandmark ? (matchingLandmark.id ?? matchingLandmark.labelKey ?? "") : "");
  }

  function openStep(step: Step) {
    if (!canOpenStep[step]) return;
    if (step === 3) setEvaluationVisited(true);
    setActiveStep(step);
  }

  async function handleUpload(plane: Plane, file?: File) {
    if (!file) return;
    if (!normalizedCaseId) {
      setMessage("Ingresá un identificador de caso de-identificado antes de cargar archivos.");
      return;
    }
    if (!hasAllowedExtension(file.name)) {
      setUploads((current) => ({ ...current, [plane]: { fileName: file.name, status: "error", error: `Extensión no permitida. Usar: ${allowedInputExtensions.join(", ")}` } }));
      return;
    }
    setRun(null);
    setEvaluationVisited(false);
    setReviewSaved(false);
    setUploads((current) => ({ ...current, [plane]: { fileName: file.name, status: "uploading" } }));
    try {
      const input = await uploadAiInput(file, normalizedCaseId, plane);
      setUploads((current) => ({ ...current, [plane]: { fileName: file.name, status: "uploaded", input } }));
      setMessage(`${planeLabel(plane)} cargado desde backend: ${input.inputId}.`);
    } catch (error) {
      setUploads((current) => ({ ...current, [plane]: { fileName: file.name, status: "error", error: apiErrorMessage(error, "cargar archivo") } }));
    }
  }

  function handleFileChange(plane: Plane, event: ChangeEvent<HTMLInputElement>) {
    void handleUpload(plane, event.target.files?.[0]);
    event.target.value = "";
  }

  async function executeRun() {
    if (!sagittalUploadReady || runInFlightRef.current) return;
    const subjectError = validateSubjectRef(studyMetadata.subjectRef);
    if (subjectError) {
      setStudyMetadataError(subjectError);
      setMessage(subjectRefErrorMessage);
      return;
    }
    const normalizedStudyMetadata = normalizeStudyMetadataInput(studyMetadata);
    runInFlightRef.current = true;
    setRunning(true);
    setMessage("Procesando / esperando respuesta del modelo sagital. El backend no expone progreso granular; no se muestra porcentaje.");
    try {
      const payload: MultiplanarRunPayload = {
        caseId: normalizedCaseId,
        studyMetadata: normalizedStudyMetadata,
        sagittalInputId: uploads.sagittal.input?.inputId ?? "",
        sagittalModelKey: "sagittal_spider",
        allowContractFallback: false,
        metadata: {
          source: "frontend-analysis-timeline",
          uiFlow: "fe-p5-guided-analysis",
          inferenceMode: "real_baseline",
          requestedInferenceMode: "real_baseline",
          allowContractFallback: false,
          axialMode: axialUploadReady ? "experimental_requested" : "optional_not_provided",
        },
        ...(axialUploadReady ? { axialInputId: uploads.axial.input?.inputId, axialModelKey: "axial_t2_alkafri" } : {}),
      };
      const result = await runMultiplanarAnalysis(payload);
      const readiness = evaluateRealInferenceReadiness(result);
      setRun(result);
      if (readiness.ready) {
        setEvaluationVisited(true);
        setActiveStep(3);
        setMessage(`Corrida ${result.runId} finalizada con inferencia sagital real disponible.`);
      } else {
        setActiveStep(2);
        setMessage(`Corrida ${result.runId} finalizada sin sagital real evaluable. ${readiness.reasons.join(" ")}`);
      }
    } catch (error) {
      setActiveStep(2);
      setMessage(apiErrorMessage(error, "ejecutar análisis real"));
    } finally {
      runInFlightRef.current = false;
      setRunning(false);
    }
  }

  function updateMeasurements(next: Measurement[], detail: string) {
    setMeasurements(next);
    setReviewSaved(false);
    setMessage(`Borrador local: ${detail}.`);
  }

  async function saveReview() {
    if (!reviewPayloadReady(run, reviewer)) {
      setMessage(!reviewer.trim() ? "Revisor obligatorio para guardar la revisión." : `La revisión requiere corrida sagital real. ${sagittalReviewReady.reasons.join(" ")}`);
      return;
    }
    const currentRun = run;
    if (!currentRun) return;
    setSavingReview(true);
    try {
      await submitRunReview(currentRun.runId, {
        reviewStatus,
        reviewer: reviewer.trim(),
        comments: notes.trim(),
        corrections: reviewCorrectionsFrom(measurements),
      });
      setReviewSaved(true);
      setMessage("Revisión guardada por el flujo existente de corridas.");
    } catch (error) {
      setMessage(apiErrorMessage(error, "guardar revisión"));
    } finally {
      setSavingReview(false);
    }
  }

  async function viewSavedStudy() {
    if (!onViewSavedStudy || !run?.caseId) return;
    setNavigatingToSavedStudy(true);
    try {
      await onViewSavedStudy(run.caseId);
    } catch (error) {
      // La revisión ya fue guardada (reviewSaved permanece true); solo falló
      // la navegación posterior. No se reintenta el guardado automáticamente.
      setMessage(apiErrorMessage(error, "abrir el estudio guardado"));
    } finally {
      setNavigatingToSavedStudy(false);
    }
  }

  function startNewAnalysis() {
    setCaseId("");
    setStudyMetadata(emptyStudyMetadataDraft());
    setStudyMetadataError("");
    setUploads(emptyUploads);
    setRun(null);
    setMeasurements([]);
    setReviewStatus("edited");
    setNotes("");
    setReviewSaved(false);
    setEvaluationVisited(false);
    setSelectedSagittalLandmark("");
    setSagittalOverlayAvailable(false);
    setActiveStep(1);
    setMessage("Nuevo análisis iniciado.");
  }

  return (
    <div className="view-stack analysis-timeline-view">
      <section className="page-heading compact-heading">
        <div>
          <p>Nuevo análisis</p>
          <h1>Carga guiada de resonancia</h1>
        </div>
        <div className="screen-summary">
          <strong>{normalizedCaseId || "Sin caso"}</strong>
          <span>4 pasos, sagital obligatorio y axial experimental</span>
        </div>
      </section>

      {message && (
        <div className="toast info app-error-toast" role="status">
          <span>{message}</span>
          {!contract && !loadingContract && <button className="ghost-button" onClick={loadContract} type="button">Reintentar contrato</button>}
        </div>
      )}

      <nav className="analysis-stepper" aria-label="Pasos del análisis">
        {[
          { step: 1 as Step, label: "Cargar estudio" },
          { step: 2 as Step, label: "Procesamiento" },
          { step: 3 as Step, label: "Evaluación" },
          { step: 4 as Step, label: "Aprobar o editar" },
        ].map((item) => (
          <button key={item.step} className={activeStep === item.step ? "active" : ""} disabled={!canOpenStep[item.step]} onClick={() => openStep(item.step)} type="button" aria-current={activeStep === item.step ? "step" : undefined}>
            <span>{item.step}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {activeStep === 1 && (
        <section className="panel-card compact-card analysis-panel">
          <div className="section-title"><h2>1. Cargar estudio</h2><StatusBadge tone={sagittalUploadReady ? "green" : "amber"}>{sagittalUploadReady ? "sagital listo" : "falta sagital"}</StatusBadge></div>
          <div className="settings-form-grid">
            <label>
              <span>ID de caso deidentificado</span>
              <input value={caseId} onChange={(event) => { setCaseId(event.target.value); setRun(null); }} placeholder="CASE-XXXX" />
            </label>
            <label>
              <span>Contrato</span>
              <input readOnly value={loadingContract ? "consultando" : String(contract?.status ?? "sin contrato")} />
            </label>
          </div>
          <section className="metadata-form-section" aria-labelledby="study-metadata-heading">
            <div className="section-title">
              <div>
                <h2 id="study-metadata-heading">Datos académicos de-identificados</h2>
                <p className="muted compact-copy">Uso académico con datos de-identificados. No ingreses nombre, DNI, correo, teléfono, domicilio ni historia clínica real.</p>
              </div>
            </div>
            <div className="settings-form-grid">
              <label>
                <span>Referencia de paciente de-identificada</span>
                <input
                  value={studyMetadata.subjectRef}
                  onBlur={() => setStudyMetadataError(validateSubjectRef(studyMetadata.subjectRef) ?? "")}
                  onChange={(event) => {
                    setStudyMetadata((current) => ({ ...current, subjectRef: event.target.value }));
                    setStudyMetadataError("");
                  }}
                  placeholder="SPIDER-101"
                  aria-invalid={Boolean(studyMetadataError)}
                  aria-describedby="subject-ref-help"
                />
                <small id="subject-ref-help">Código académico estable. No ingreses nombre, DNI, email ni datos identificatorios directos.</small>
                {studyMetadataError && <span className="delta-alert">{studyMetadataError}</span>}
              </label>
              <label>
                <span>Fecha del estudio</span>
                <input type="date" value={studyMetadata.studyDate} onChange={(event) => setStudyMetadata((current) => ({ ...current, studyDate: event.target.value }))} />
              </label>
              <label>
                <span>Modalidad</span>
                <select value={studyMetadata.modality} onChange={(event) => setStudyMetadata((current) => ({ ...current, modality: event.target.value }))}>
                  <option value="">No informada</option>
                  <option value="MRI">Resonancia magnética</option>
                </select>
              </label>
              <label>
                <span>Prioridad</span>
                <select value={studyMetadata.reviewPriority} onChange={(event) => setStudyMetadata((current) => ({ ...current, reviewPriority: event.target.value as StudyMetadataDraft["reviewPriority"] }))}>
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </label>
              <label className="form-span-all">
                <span>Descripción</span>
                <input maxLength={200} value={studyMetadata.description} onChange={(event) => setStudyMetadata((current) => ({ ...current, description: event.target.value }))} placeholder="RM lumbar sagital T2" />
              </label>
            </div>
          </section>
          <div className="analysis-upload-grid">
            {uploadPlanes.map((plane) => {
              const upload = uploads[plane];
              return (
                <article className="analysis-upload-card" key={plane}>
                  <h3>{planeLabel(plane)}</h3>
                  <p>{upload.fileName ?? (plane === "axial" ? "Opcional / experimental" : "Sin archivo cargado")}</p>
                  <input aria-label={`Cargar plano ${planeLabel(plane)}`} accept={uploadAccept} disabled={!normalizedCaseId || upload.status === "uploading"} onChange={(event) => handleFileChange(plane, event)} type="file" />
                  {upload.status === "uploading" && <span className="technical-state">subiendo...</span>}
                  {upload.status === "uploaded" && <StatusBadge tone={plane === "axial" ? "amber" : "green"}>{plane === "axial" ? "entrada experimental cargada" : "entrada real cargada"}</StatusBadge>}
                  {upload.status === "error" && <span className="delta-alert">{upload.error}</span>}
                </article>
              );
            })}
          </div>
          <div className="analysis-actions">
            <button className="primary-button" disabled={!sagittalUploadReady} onClick={() => setActiveStep(2)} type="button">Continuar a procesamiento</button>
          </div>
          {!sagittalUploadReady && <div className="panel-hidden-placeholder">Para habilitar el paso 2 se requiere ID de caso y plano sagital cargado por backend. El axial es opcional y experimental.</div>}
        </section>
      )}

      {activeStep === 2 && (
        <section className="view-stack">
          <section className="panel-card compact-card analysis-panel">
            <div className="section-title"><h2>2. Procesamiento</h2><StatusBadge tone={running ? "blue" : run ? realInferenceReady ? "green" : "amber" : "blue"}>{running ? "esperando modelo" : run ? realInferenceReady ? "sagital real disponible" : "sin sagital real" : "pendiente"}</StatusBadge></div>
            <p className="muted compact-copy">El backend no expone una señal de progreso granular. Se muestra espera honesta sin barra ni porcentaje inventado.</p>
            <dl className="settings-details">
              <div><dt>Entrada sagital</dt><dd>{uploads.sagittal.input?.inputId ?? "pendiente"}</dd></div>
              <div><dt>Entrada axial</dt><dd>{uploads.axial.input?.inputId ?? "opcional no cargada"}</dd></div>
              <div><dt>Modo solicitado</dt><dd>real_baseline</dd></div>
            <div><dt>Corrida</dt><dd>{run?.runId ?? "sin ejecutar"}</dd></div>
              {run && <div><dt>Mediciones sagitales reales</dt><dd>{sagittalRows.length}</dd></div>}
            </dl>
            {running && <div className="clinical-loading-state inline-loading"><span className="clinical-spinner" /><div><h2>Procesando</h2><p>Esperando respuesta del modelo.</p></div></div>}
            {run && !realInferenceReady && <div className="panel-hidden-placeholder"><strong>El modelo sagital aún no tiene inferencia real disponible.</strong><span>{fallbackReason(run, contract)}</span><span>No se habilita evaluación con mediciones de marcador.</span></div>}
            <div className="analysis-actions">
              <button className="ghost-button" onClick={() => setActiveStep(1)} type="button">Volver a carga</button>
              <button className="primary-button" disabled={!sagittalUploadReady || running} onClick={() => void executeRun()} type="button">{running ? "Procesando..." : "Ejecutar análisis real"}</button>
              <button className="ghost-button" disabled={!realInferenceReady} onClick={() => setActiveStep(3)} type="button">Continuar a evaluación</button>
            </div>
          </section>
          <TechnicalStatusPanel run={run} />
          {run && <ProvenancePanel run={run} />}
          {run && <AssetProvenancePanel run={run} />}
        </section>
      )}

      {activeStep === 3 && (
        <section className="analysis-evaluation-grid">
          <section className="panel-card span-all sagittal-result-header">
            <div className="section-title">
              <div>
                <h2>Resultado sagital real_baseline</h2>
                <p className="compact-copy">Inferencia sagital real disponible. Axial no cargado o no habilitado. La revisión sagital puede continuar.</p>
              </div>
              <StatusBadge tone="green">sagital_only</StatusBadge>
            </div>
            <dl className="settings-details result-summary-strip">
              <div><dt>Modelo</dt><dd>{sagittalPlaneRun?.model.key ?? "no informado"}</dd></div>
              <div><dt>Versión</dt><dd>{sagittalPlaneRun?.model.version ?? "no informado"}</dd></div>
              <div><dt>Hash</dt><dd title={sagittalArtifactHash}>{abbreviateArtifactHash(sagittalArtifactHash)}</dd></div>
              <div><dt>Modo</dt><dd>{resolvePlaneInferenceMode(sagittalPlaneRun) ?? "no informado"}</dd></div>
              <div><dt>Corte</dt><dd>{sagittalMetadata.selectedSlice ?? "?"}/{sagittalMetadata.sliceCount ?? "?"}</dd></div>
              <div><dt>Revisión</dt><dd>requerida</dd></div>
            </dl>
            <div className="ai-honesty-row">
              <StatusBadge tone="amber">Revisión profesional obligatoria</StatusBadge>
              <StatusBadge tone="purple">No apto para diagnóstico clínico</StatusBadge>
              <StatusBadge tone={workspaceMode === "sagittal_only" ? "blue" : "amber"}>{workspaceMode}</StatusBadge>
            </div>
          </section>
          <section className="panel-card span-all">
            <div className="section-title">
              <h2>Visor sagital real</h2>
              <StatusBadge tone={sagittalOverlayAvailable ? "green" : "amber"}>{sagittalOverlayAvailable ? "superposición real disponible" : "superposición no disponible"}</StatusBadge>
            </div>
            {sagittalViewerModel && (
              <MriSliceViewer
                model={sagittalViewerModel}
                selectedLandmarkId={selectedSagittalLandmark}
                onSelectLandmark={handleSelectSagittalLandmark}
                readonly
                overlayEnabled
                overlayOpacity={0.65}
                onOverlayAvailableChange={setSagittalOverlayAvailable}
              />
            )}
          </section>
          {axialViewerModel && (
            <section className="panel-card span-all">
              <div className="section-title">
                <h2>Visor axial (modelo candidato)</h2>
                <StatusBadge tone="amber">no baseline aprobado</StatusBadge>
              </div>
              <div className="ai-honesty-row">
                <StatusBadge tone="amber">baselineReady: {String(axialPlaneRun?.model.baselineReady ?? false)}</StatusBadge>
                <StatusBadge tone="blue">availableForRealInference: {String(axialPlaneRun?.model.availableForRealInference ?? false)}</StatusBadge>
                <StatusBadge tone="blue">readiness: {axialPlaneRun?.model.readiness ?? "no informado"}</StatusBadge>
                <StatusBadge tone="blue">runtimeQualification: {axialPlaneRun?.model.runtimeQualification ?? "no informado"}</StatusBadge>
                <StatusBadge tone="amber">qualityGatePassed: {String(axialPlaneRun?.model.qualityGatePassed ?? false)}</StatusBadge>
              </div>
              <p className="muted compact-copy">Las clases raw_* del modelo axial se muestran sin interpretación anatómica; su semántica todavía no está resuelta.</p>
              <MriSliceViewer
                model={axialViewerModel}
                selectedLandmarkId={selectedAxialLandmark}
                onSelectLandmark={setSelectedAxialLandmark}
                readonly
                overlayEnabled
                overlayOpacity={0.65}
              />
            </section>
          )}
          <div className="span-all">
            <MeasurementsPanel measurements={measurements} inferenceStatus={resolvePlaneInferenceMode(sagittalPlaneRun) ?? resolveWorkspaceInferenceMode(run)} description={`Mediciones devueltas por inferencia sagital real${axialRows.length > 0 ? " y axiales experimentales (sin interpretación anatómica de raw_*)" : ""}. Editables como borrador del revisor.`} onChange={updateMeasurements} />
          </div>

          <div className="span-all">
            <AgentSummary agentDecision={agentDecision} />
          </div>
          <details className="panel-card compact-card analysis-panel review-accordion span-all">
            <summary>Detalles técnicos y provenance</summary>
            <ProvenancePanel run={run} />
            <TechnicalStatusPanel run={run} />
          </details>
          <details className="panel-card compact-card analysis-panel review-accordion span-all">
            <summary>Funcionalidad 3D — proxy geométrico experimental</summary>
            <div className="section-title">
              <h2>{threeDProxyViewModel.title}</h2>
              <StatusBadge tone={threeDProxyViewModel.state === "available" ? "green" : "amber"}>{threeDProxyViewModel.state}</StatusBadge>
            </div>
            <SpineReconstructionPreview
              proxy={threeDProxyViewModel}
              onRetryProxy={retryThreeDAsset}
              selectedStructure={selectedStructureLabel}
              onSelectStructure={handleSelectStructure}
            />
            <p className="preview-meta">No representa una reconstrucción anatómica ni volumétrica. Deriva de bounding boxes 2D por plano con mapping explícito provisto por configuración. Seleccionar un landmark sagital resalta la estructura equivalente del proxy, y viceversa.</p>
          </details>
          <section className="panel-card compact-card analysis-panel span-all">
            <div className="analysis-actions">
              <button className="ghost-button" onClick={() => setActiveStep(2)} type="button">Volver a procesamiento</button>
              <button className="primary-button" onClick={() => { setEvaluationVisited(true); setActiveStep(4); }} type="button">Continuar a aprobar o editar</button>
            </div>
          </section>
        </section>
      )}

      {activeStep === 4 && (
        <section className="panel-card compact-card analysis-panel">
          <div className="section-title"><h2>4. Aprobar o editar</h2><StatusBadge tone={reviewSaved ? "green" : "amber"}>{reviewSaved ? "guardado" : "borrador"}</StatusBadge></div>
          <div className="settings-form-grid">
            <label>
              <span>Estado de revisión</span>
              <select value={reviewStatus} onChange={(event) => { setReviewStatus(event.target.value as RunReviewStatus); setReviewSaved(false); }}>
                {reviewStatuses.map((status) => <option key={status} value={status}>{reviewStatusLabel(status)}</option>)}
              </select>
            </label>
            <label>
              <span>Revisor</span>
              <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Nombre del profesional" />
            </label>
          </div>
          <label className="analysis-notes">
            <span>Notas / comentarios profesionales</span>
            <textarea value={notes} onChange={(event) => { setNotes(event.target.value); setReviewSaved(false); }} rows={5} placeholder="Editar el preinforme, justificar observaciones o registrar comentarios." />
          </label>
          <div className="analysis-actions">
            <button className="ghost-button" onClick={() => setActiveStep(3)} type="button">Volver a evaluación</button>
            <button className="primary-button" disabled={savingReview || !reviewPayloadReady(run, reviewer)} onClick={() => void saveReview()} type="button">{savingReview ? "Guardando..." : "Guardar revisión"}</button>
          </div>
          <p className="settings-persistence-note">La revisión se persiste con `submitRunReview` sobre la corrida real generada. Las correcciones de mediciones editadas se envían como `corrections` con valores before/after.</p>
          {!sagittalReviewReady.ready && <div className="panel-hidden-placeholder">No se puede guardar revisión sin corrida sagital real: {sagittalReviewReady.reasons.join(" ")}</div>}
          <div className="settings-persistence-note">Capacidades preparadas: sagital {sagittalRunReady.ready ? "listo" : "bloqueado"}, axial {axialRunReady.ready ? "experimental disponible" : "candidate_below_quality_gate"}, dual {dualRunReady.ready ? "listo" : "bloqueado"}.</div>
          {reviewSaved && (
            <div className="analysis-actions">
              <button className="ghost-button" onClick={() => setActiveStep(3)} type="button">Volver a evaluación</button>
              {onViewSavedStudy && (
                <button className="ghost-button" disabled={navigatingToSavedStudy || !run?.caseId} onClick={() => void viewSavedStudy()} type="button">
                  {navigatingToSavedStudy ? "Abriendo..." : "Ver estudio guardado"}
                </button>
              )}
              {onBackToStudies && <button className="ghost-button" onClick={onBackToStudies} type="button">Volver a estudios</button>}
              <button className="ghost-button" onClick={startNewAnalysis} type="button">Iniciar nuevo análisis</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
