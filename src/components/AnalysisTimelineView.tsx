import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { BackendApiError, getMultiplanarContract, runMultiplanarAnalysis, submitRunReview, uploadAiInput } from "../multiplanarApi";
import type { Measurement, Plane } from "../appTypes";
import type { InputResponse, MultiplanarMeasurementValue, MultiplanarPlaneRun, MultiplanarRunResponse, RunReviewStatus } from "../multiplanarRunTypes";
import type { MultiplanarContract } from "../multiplanarTypes";
import { AgentSummary } from "./AgentSummary";
import { MeasurementsPanel } from "./MeasurementsPanel";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";
import { StatusBadge } from "./StatusBadge";

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
  if (error instanceof BackendApiError) return `Backend respondió ${error.status} al ${action} (${error.path}).`;
  if (error instanceof Error) return error.message;
  return `No se pudo ${action}.`;
}

function measurementRows(planeRun?: MultiplanarPlaneRun): MultiplanarMeasurementValue[] {
  if (!planeRun) return [];
  if (Array.isArray(planeRun.measurements)) return planeRun.measurements;
  return planeRun.measurements?.values ?? [];
}

function toMeasurement(row: MultiplanarMeasurementValue, plane: Plane, index: number): Measurement {
  const id = String(row.id ?? `${plane}-${row.label ?? "measurement"}-${index}`);
  return {
    id,
    label: String(row.label ?? row.classLabel ?? row.className ?? `Medición ${index + 1}`),
    level: typeof row.level === "string" ? row.level : undefined,
    value: row.value ?? "",
    aiValue: row.value ?? "",
    unit: String(row.unit ?? ""),
    confidence: typeof row.confidence === "number" ? row.confidence : undefined,
    plane,
    source: "AI",
    status: "pendiente",
    outlier: Boolean(row.outlier),
  };
}

function measurementsFromRun(run: MultiplanarRunResponse | null): Measurement[] {
  if (!run?.planes) return [];
  return uploadPlanes.flatMap((plane) => measurementRows(run.planes?.[plane]).map((row, index) => toMeasurement(row, plane, index)));
}

function isRealMode(value?: string) {
  return value === "real" || value === "real_baseline";
}

function runHasRealInference(run: MultiplanarRunResponse | null) {
  if (!run) return false;
  const planeRuns = uploadPlanes.map((plane) => run.planes?.[plane]);
  const allPlanesReal = planeRuns.every((planeRun) => planeRun && isRealMode(planeRun.effectiveInferenceMode));
  const workspaceReal = isRealMode(run.effectiveInferenceMode);
  const hasMeasurements = measurementsFromRun(run).some((measurement) => !measurement.placeholder);
  return workspaceReal && allPlanesReal && hasMeasurements;
}

function fallbackReason(run: MultiplanarRunResponse | null, contract: MultiplanarContract | null) {
  if (!run) return "";
  const planeModes = uploadPlanes.map((plane) => `${plane}: ${run.planes?.[plane]?.effectiveInferenceMode ?? "sin run"}`).join(" · ");
  const readiness = uploadPlanes.map((plane) => `${plane}: ${contract?.planes?.[plane]?.readiness ?? "sin contrato"}`).join(" · ");
  if (!isRealMode(run.effectiveInferenceMode)) return `Modo efectivo del workspace: ${run.effectiveInferenceMode}. ${planeModes}.`;
  if (!uploadPlanes.every((plane) => isRealMode(run.planes?.[plane]?.effectiveInferenceMode))) return `Algún plano no volvió en inferencia real. ${planeModes}.`;
  if (!measurementsFromRun(run).length) return `El run no devolvió mediciones reales almacenadas. Preparación: ${readiness}.`;
  return `Preparación insuficiente. ${readiness}.`;
}

export function AnalysisTimelineView({ reviewerName }: { reviewerName?: string }) {
  const [activeStep, setActiveStep] = useState<Step>(1);
  const [caseId, setCaseId] = useState("");
  const [contract, setContract] = useState<MultiplanarContract | null>(null);
  const [uploads, setUploads] = useState<Record<Plane, UploadState>>(emptyUploads);
  const [run, setRun] = useState<MultiplanarRunResponse | null>(null);
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

  const normalizedCaseId = caseId.trim();
  const uploadsComplete = Boolean(normalizedCaseId && uploads.sagittal.input?.inputId && uploads.axial.input?.inputId);
  const realInferenceReady = runHasRealInference(run);
  const canOpenStep: Record<Step, boolean> = {
    1: true,
    2: uploadsComplete,
    3: uploadsComplete && realInferenceReady,
    4: uploadsComplete && realInferenceReady && evaluationVisited,
  };
  const agentDecision = useMemo(() => ({
    status: realInferenceReady ? "borrador_revisable" : "inferencias_no_disponibles",
    priority: "media" as const,
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    recommendedAction: realInferenceReady ? "Revisar mediciones, resumen del agente y confirmar o editar el reporte." : "Esperar inferencia real del backend antes de evaluar mediciones.",
    flags: realInferenceReady ? ["preinforme generado", "revisión humana requerida"] : ["sin inferencia real"],
    reasons: realInferenceReady ? [`Run ${run?.runId}`, `Modo efectivo ${run?.effectiveInferenceMode}`] : [fallbackReason(run, contract) || "Sin run real disponible."],
  }), [contract, realInferenceReady, run]);

  useEffect(() => {
    setReviewer(reviewerName ?? "");
  }, [reviewerName]);

  useEffect(() => {
    setLoadingContract(true);
    getMultiplanarContract()
      .then(setContract)
      .catch((error) => setMessage(apiErrorMessage(error, "consultar contrato multiplanar")))
      .finally(() => setLoadingContract(false));
  }, []);

  useEffect(() => {
    if (run) setMeasurements(measurementsFromRun(run));
  }, [run]);

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
    if (!uploadsComplete) return;
    setRunning(true);
    setMessage("Procesando / esperando respuesta del modelo. El backend no expone progreso granular; no se muestra porcentaje.");
    try {
      const result = await runMultiplanarAnalysis({
        caseId: normalizedCaseId,
        sagittalInputId: uploads.sagittal.input?.inputId ?? "",
        axialInputId: uploads.axial.input?.inputId ?? "",
        sagittalModelKey: "sagittal_spider",
        axialModelKey: "axial_t2_alkafri",
        allowContractFallback: false,
        metadata: {
          source: "frontend-analysis-timeline",
          uiFlow: "fe-p5-guided-analysis",
          requestedInferenceMode: contract?.readyForRealBaseline ? "real_baseline" : "contract",
        },
      });
      setRun(result);
      if (runHasRealInference(result)) {
        setEvaluationVisited(true);
        setActiveStep(3);
        setMessage(`Run ${result.runId} finalizado con inferencia real disponible.`);
      } else {
        setActiveStep(2);
        setMessage(`Run ${result.runId} finalizado sin inferencia real evaluable. ${fallbackReason(result, contract)}`);
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, "ejecutar análisis real"));
    } finally {
      setRunning(false);
    }
  }

  function updateMeasurements(next: Measurement[], detail: string) {
    setMeasurements(next);
    setReviewSaved(false);
    setMessage(`Borrador local: ${detail}.`);
  }

  async function saveReview() {
    if (!run || !reviewer.trim()) {
      setMessage("Revisor obligatorio para guardar la revisión.");
      return;
    }
    setSavingReview(true);
    try {
      await submitRunReview(run.runId, {
        reviewStatus,
        reviewer: reviewer.trim(),
        comments: notes.trim(),
        measurementCorrections: measurements
          .filter((measurement) => measurement.source === "Reviewer" || measurement.status === "editado")
          .map((measurement) => ({ measurementId: measurement.id, value: measurement.value, unit: measurement.unit, comment: "Corrección desde timeline FE-P5" })),
      });
      setReviewSaved(true);
      setMessage("Revisión guardada por el flujo existente de runs.");
    } catch (error) {
      setMessage(apiErrorMessage(error, "guardar revisión"));
    } finally {
      setSavingReview(false);
    }
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
          <span>4 pasos, sin ejecución sobre mocks</span>
        </div>
      </section>

      {message && <div className="toast info" role="status">{message}</div>}

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
          <div className="section-title"><h2>1. Cargar estudio</h2><StatusBadge tone={uploadsComplete ? "green" : "amber"}>{uploadsComplete ? "listo" : "faltan planos"}</StatusBadge></div>
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
          <div className="analysis-upload-grid">
            {uploadPlanes.map((plane) => {
              const upload = uploads[plane];
              return (
                <article className="analysis-upload-card" key={plane}>
                  <h3>{planeLabel(plane)}</h3>
                  <p>{upload.fileName ?? "Sin archivo cargado"}</p>
                  <input aria-label={`Cargar plano ${planeLabel(plane)}`} accept={uploadAccept} disabled={!normalizedCaseId || upload.status === "uploading"} onChange={(event) => handleFileChange(plane, event)} type="file" />
                  {upload.status === "uploading" && <span className="technical-state">subiendo...</span>}
                  {upload.status === "uploaded" && <StatusBadge tone="green">input real cargado</StatusBadge>}
                  {upload.status === "error" && <span className="delta-alert">{upload.error}</span>}
                </article>
              );
            })}
          </div>
          <div className="analysis-actions">
            <button className="primary-button" disabled={!uploadsComplete} onClick={() => setActiveStep(2)} type="button">Continuar a procesamiento</button>
          </div>
          {!uploadsComplete && <div className="panel-hidden-placeholder">Para habilitar el paso 2 se requieren ID de caso, plano sagital y plano axial cargados por backend.</div>}
        </section>
      )}

      {activeStep === 2 && (
        <section className="panel-card compact-card analysis-panel">
          <div className="section-title"><h2>2. Procesamiento</h2><StatusBadge tone={running ? "blue" : run ? realInferenceReady ? "green" : "amber" : "blue"}>{running ? "esperando modelo" : run ? realInferenceReady ? "real disponible" : "sin inferencia real" : "pendiente"}</StatusBadge></div>
          <p className="muted compact-copy">El backend no expone una señal de progreso granular. Se muestra espera honesta sin barra ni porcentaje inventado.</p>
          <dl className="settings-details">
            <div><dt>Sagital input</dt><dd>{uploads.sagittal.input?.inputId ?? "pendiente"}</dd></div>
            <div><dt>Axial input</dt><dd>{uploads.axial.input?.inputId ?? "pendiente"}</dd></div>
            <div><dt>Modo solicitado</dt><dd>{contract?.readyForRealBaseline ? "real_baseline" : "contract"}</dd></div>
            <div><dt>Run</dt><dd>{run?.runId ?? "sin ejecutar"}</dd></div>
          </dl>
          {running && <div className="clinical-loading-state inline-loading"><span className="clinical-spinner" /><div><h2>Procesando</h2><p>Esperando respuesta del modelo.</p></div></div>}
          {run && !realInferenceReady && <div className="panel-hidden-placeholder"><strong>El modelo aún no tiene inferencia real disponible.</strong><span>{fallbackReason(run, contract)}</span><span>No se habilita evaluación con mediciones placeholder.</span></div>}
          <div className="analysis-actions">
            <button className="ghost-button" onClick={() => setActiveStep(1)} type="button">Volver a carga</button>
            <button className="primary-button" disabled={!uploadsComplete || running} onClick={() => void executeRun()} type="button">{running ? "Procesando..." : "Ejecutar análisis real"}</button>
            <button className="ghost-button" disabled={!realInferenceReady} onClick={() => setActiveStep(3)} type="button">Continuar a evaluación</button>
          </div>
        </section>
      )}

      {activeStep === 3 && (
        <section className="analysis-evaluation-grid">
          <MeasurementsPanel measurements={measurements} inferenceStatus={run?.effectiveInferenceMode} description="Mediciones devueltas por inferencia real. Editables como borrador del revisor." onChange={updateMeasurements} />
          <section className="panel-card">
            <div className="section-title"><h2>Modelo 3D</h2><StatusBadge tone="blue">atlas genérico</StatusBadge></div>
            <SpineReconstructionPreview />
            <p className="preview-meta">Representación anatómica de referencia; no paciente-específica.</p>
          </section>
          <AgentSummary agentDecision={agentDecision} />
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
              <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as RunReviewStatus)}>
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
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} placeholder="Editar el preinforme, justificar observaciones o registrar comentarios." />
          </label>
          <div className="analysis-actions">
            <button className="ghost-button" onClick={() => setActiveStep(3)} type="button">Volver a evaluación</button>
            <button className="primary-button" disabled={savingReview || !run || !reviewer.trim()} onClick={() => void saveReview()} type="button">{savingReview ? "Guardando..." : "Guardar revisión"}</button>
          </div>
          <p className="settings-persistence-note">La revisión se persiste con `submitRunReview` sobre el run real generado. Las correcciones de mediciones editadas se envían como `measurementCorrections`.</p>
        </section>
      )}
    </div>
  );
}
