import { useEffect, useState, type ChangeEvent } from "react";
import { BackendApiError, runMultiplanarAnalysis, uploadAiInput, uploadStudyArchive } from "../../multiplanarApi";
import type { Plane } from "../../appTypes";
import type { InputResponse, StudyIngestionResponse } from "../../contracts/inputApiTypes";
import type { MultiplanarRunPayload } from "../../contracts/multiplanarHttpTypes";
import { evaluateRealInferenceReadiness } from "../../inferenceReadiness";
import {
  emptyStudyMetadataDraft,
  normalizeStudyMetadataInput,
  subjectRefErrorMessage,
  validateSubjectRef,
  type StudyMetadataDraft,
} from "../../studyMetadata";
import {
  initialProductAnalysisState,
  runP109ProductFlow,
  type ProductAnalysisState,
  type ProductFlowPhase,
} from "./productAnalysisFlow";

/**
 * Carga de un estudio nuevo, como panel sobre la lista de trabajo.
 *
 * Reemplaza al asistente de cuatro pasos: cargar → procesar → evaluar → aprobar.
 * Los dos últimos pasos duplicaban la sala de lectura con otro contrato de
 * revisión, y el patrón de asistente numerado es de alta de SaaS, no de lectura
 * radiológica. Acá el flujo es el que describieron los médicos: se carga el
 * estudio, se procesa, y aparece en la lista para leerlo.
 */

const allowedInputExtensions = [".npy", ".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".mha", ".mhd", ".dcm", ".zip"];
const uploadAccept = allowedInputExtensions.join(",");

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

/**
 * Carga de un estudio entero en un solo archivo.
 *
 * Es el camino normal: un estudio de resonancia sale del PACS como un archivo con
 * todas sus series adentro. Partirlo a mano en dos zips —uno sagital y otro axial— es
 * pedirle al médico que haga la clasificación que la metadata DICOM ya trae resuelta,
 * y que se equivoque cuando el nombre de la serie no coincide con su orientación.
 */
type StudyUploadState = {
  fileName?: string;
  status: "idle" | "uploading" | "uploaded" | "error";
  study?: StudyIngestionResponse;
  error?: string;
};

function seriesLabel(series: { plane: string; weighting: string; description: string; sliceCount: number }) {
  const plane = series.plane === "sagittal" ? "Sagital" : series.plane === "axial" ? "Axial" : series.plane === "coronal" ? "Coronal" : series.plane;
  const weighting = series.weighting === "t1" || series.weighting === "t2" ? series.weighting.toUpperCase() : series.weighting;
  return `${plane} ${weighting} · ${series.sliceCount} cortes${series.description ? ` · ${series.description}` : ""}`;
}

type Props = {
  onClose: () => void;
  /** Se invoca con el caseId cuando la corrida terminó y el estudio ya es legible. */
  onAnalysisReady: (caseId: string) => void;
};

function planeLabel(plane: Plane) {
  return plane === "sagittal" ? "Sagital" : "Axial";
}

function hasAllowedExtension(fileName: string) {
  const lowered = fileName.toLowerCase();
  return allowedInputExtensions.some((extension) => lowered.endsWith(extension));
}

/**
 * Misma regla que aplica el backend al identificador de caso.
 *
 * Se repite acá a propósito: el backend la valida porque es quien no puede confiar en
 * el cliente, y la pantalla la valida porque el médico tiene que enterarse mientras
 * escribe y no después de elegir el archivo. Un error que aparece recién al subir
 * obliga a rehacer el paso entero sin decir qué carácter sobraba.
 */
const CASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

function caseIdError(value: string): string {
  if (!value) return "";
  if (!/^[A-Za-z0-9]/.test(value)) return "Tiene que empezar con una letra o un número.";
  if (value.length > 80) return "Máximo 80 caracteres.";
  const invalid = [...value].find((character) => !/[A-Za-z0-9._:-]/.test(character));
  if (invalid) {
    // Se nombra el carácter que sobra: "caracteres inválidos" obliga a adivinar cuál.
    return invalid === " "
      ? "No puede llevar espacios. Usá guion o guion bajo."
      : `El carácter «${invalid}» no está permitido. Usá letras, números, punto, guion, guion bajo o dos puntos.`;
  }
  return CASE_ID_PATTERN.test(value) ? "" : "Formato no permitido.";
}

function apiErrorMessage(error: unknown, action: string) {
  if (error instanceof BackendApiError) {
    return `No se pudo ${action}: ${error.message}`;
  }
  return error instanceof Error ? `No se pudo ${action}: ${error.message}` : `No se pudo ${action}.`;
}

const productPhaseLabel: Record<ProductFlowPhase, string> = {
  preparing_series: "Preparando series",
  segmenting_t1: "Segmentando T1",
  segmenting_t2: "Segmentando T2",
  analyzing_findings: "Analizando hallazgos",
  completed: "Completado",
  degraded: "Completado con capacidad reducida",
  error: "Error recuperable",
};

function productSeriesLabel(status: ProductAnalysisState["series"]["sagittal_t1"]["status"]) {
  if (status === "unavailable") return "No disponible";
  if (status === "pending") return "Preparada";
  if (status === "segmenting") return "Segmentando…";
  if (status === "completed") return "Segmentación completa";
  return "Error";
}

export function NewAnalysisDrawer({ onClose, onAnalysisReady }: Props) {
  const [caseId, setCaseId] = useState("");
  const [metadata, setMetadata] = useState<StudyMetadataDraft>(() => emptyStudyMetadataDraft());
  const [metadataError, setMetadataError] = useState("");
  const [uploads, setUploads] = useState<Record<Plane, UploadState>>(emptyUploads);
  const [studyUpload, setStudyUpload] = useState<StudyUploadState>({ status: "idle" });
  /* La carga por plano queda plegada: es la salida para un archivo suelto de dataset. */
  const [byPlaneOpen, setByPlaneOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [productState, setProductState] = useState<ProductAnalysisState | null>(null);
  const [persistedRun, setPersistedRun] = useState<{ caseId: string; runId: string; study?: StudyIngestionResponse } | null>(null);

  /*
   * Escape cierra el drawer. Es el equivalente por teclado del clic en el fondo, y lo
   * que cualquiera espera de un modal. No cierra durante una corrida: perder de vista
   * un análisis en curso por apoyar una tecla es peor que tener que apuntar al botón.
   */
  useEffect(() => {
    if (running) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, running]);

  const normalizedCaseId = caseId.trim();
  const caseIdIssue = caseIdError(normalizedCaseId);
  /* Sin un identificador válido no se habilita la carga: el archivo se subiría para
     ser rechazado, y el médico tendría que volver a elegirlo. */
  const caseIdReady = Boolean(normalizedCaseId) && !caseIdIssue;
  /*
   * El identificador de entrada puede venir de las dos vías. La del estudio completo
   * tiene prioridad porque el plano lo decidió la metadata; la de plano suelto es lo
   * que el médico declaró a mano.
   */
  const sagittalInputId = studyUpload.study?.sagittal?.inputId ?? uploads.sagittal.input?.inputId;
  const axialInputId = studyUpload.study?.axial?.inputId ?? uploads.axial.input?.inputId;
  const sagittalReady = Boolean(normalizedCaseId && sagittalInputId);
  const axialReady = Boolean(axialInputId);

  async function uploadStudy(file?: File) {
    if (!file) return;
    if (!caseIdReady) {
      setMessage(caseIdIssue || "Ingresá un identificador de caso de-identificado antes de cargar el estudio.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setStudyUpload({ fileName: file.name, status: "error", error: "El estudio completo se carga como .zip. Para un archivo suelto usá la carga por plano." });
      return;
    }
    setPersistedRun(null);
    setProductState(null);
    setStudyUpload({ fileName: file.name, status: "uploading" });
    try {
      const study = await uploadStudyArchive(file, normalizedCaseId);
      setStudyUpload({ fileName: file.name, status: "uploaded", study });
      setMessage("");
    } catch (error) {
      setStudyUpload({ fileName: file.name, status: "error", error: apiErrorMessage(error, "cargar el estudio") });
    }
  }

  async function upload(plane: Plane, file?: File) {
    if (!file) return;
    if (!caseIdReady) {
      setMessage(caseIdIssue || "Ingresá un identificador de caso de-identificado antes de cargar archivos.");
      return;
    }
    if (!hasAllowedExtension(file.name)) {
      setUploads((current) => ({
        ...current,
        [plane]: { fileName: file.name, status: "error", error: `Extensión no permitida. Usar: ${allowedInputExtensions.join(", ")}` },
      }));
      return;
    }
    setUploads((current) => ({ ...current, [plane]: { fileName: file.name, status: "uploading" } }));
    try {
      const input = await uploadAiInput(file, normalizedCaseId, plane);
      setUploads((current) => ({ ...current, [plane]: { fileName: file.name, status: "uploaded", input } }));
      setMessage("");
    } catch (error) {
      setUploads((current) => ({
        ...current,
        [plane]: { fileName: file.name, status: "error", error: apiErrorMessage(error, "cargar archivo") },
      }));
    }
  }

  function onFileChange(plane: Plane, event: ChangeEvent<HTMLInputElement>) {
    void upload(plane, event.target.files?.[0]);
    event.target.value = "";
  }

  async function runProductExtensions(context: { caseId: string; runId: string; study?: StudyIngestionResponse }) {
    setProductState(initialProductAnalysisState(context.study));
    return runP109ProductFlow({
      caseId: context.caseId,
      multiplanarRunId: context.runId,
      study: context.study,
      onState: (state) => {
        setProductState(state);
        setMessage(state.message);
      },
    });
  }

  async function retryProductExtensions() {
    if (!persistedRun || running) return;
    setRunning(true);
    try {
      await runProductExtensions(persistedRun);
    } finally {
      setRunning(false);
    }
  }

  async function run() {
    if (!sagittalReady || running) return;
    const subjectError = validateSubjectRef(metadata.subjectRef);
    if (subjectError) {
      setMetadataError(subjectError);
      setMessage(subjectRefErrorMessage);
      return;
    }
    setMetadataError("");
    setRunning(true);
    // El backend no expone progreso granular: se dice eso en vez de mostrar una
    // barra o un porcentaje inventado.
    setMessage("Procesando. El backend no informa progreso, solo el resultado.");
    try {
      const normalizedStudyMetadata = normalizeStudyMetadataInput(metadata);
      const payload: MultiplanarRunPayload = {
        caseId: normalizedCaseId,
        studyMetadata: normalizedStudyMetadata,
        sagittalInputId: sagittalInputId ?? "",
        sagittalModelKey: "sagittal_spider",
        allowContractFallback: false,
        metadata: {
          source: "frontend-worklist-drawer",
          uiFlow: "worklist-new-analysis",
          inferenceMode: "real_baseline",
          requestedInferenceMode: "real_baseline",
          allowContractFallback: false,
          axialMode: axialReady ? "experimental_requested" : "optional_not_provided",
          // Queda registrado si los planos los separo la metadata del estudio o los
          // declaro el medico: son dos procedencias distintas del mismo dato.
          planeSource: studyUpload.study ? "study_archive_metadata" : "manual_per_plane",
        },
        /*
         * Todas las series del estudio viajan con la corrida, no solo las dos que se
         * infieren. Es lo que después le permite a la sala de lectura ofrecerlas: sin
         * esto el backend guarda los dos planos y las otras cinco quedan registradas
         * en el módulo de IA sin que nada las vincule a este estudio.
         *
         * Va vacío cuando el análisis se armó con dos archivos sueltos en vez de un
         * estudio completo, que es el caso donde no hay catálogo que llevar.
         */
        ...(studyUpload.study?.seriesFound?.length ? { studySeries: studyUpload.study.seriesFound } : {}),
        ...(axialReady ? { axialInputId, axialModelKey: "axial_t2_alkafri" } : {}),
      };
      const result = await runMultiplanarAnalysis(payload);
      const readiness = evaluateRealInferenceReadiness(result);
      if (readiness.ready) {
        const context = { caseId: normalizedCaseId, runId: result.runId, study: studyUpload.study };
        setPersistedRun(context);
        await runProductExtensions(context);
        return;
      }
      // La corrida existe pero no dejó un sagital evaluable: se queda acá con el
      // motivo, en vez de abrir una sala de lectura sin nada que leer.
      setMessage(`La corrida terminó sin sagital evaluable. ${readiness.reasons.join(" ")}`);
    } catch (error) {
      setMessage(apiErrorMessage(error, "ejecutar el análisis"));
    } finally {
      setRunning(false);
    }
  }

  return (
    // El fondo cierra el drawer al hacerle clic. Es una comodidad de mouse: el
    // equivalente por teclado es Escape, que se maneja arriba, mas el boton de cerrar.
    <div className="wl-drawer-backdrop" role="presentation" onClick={onClose}>
      {/*
        El onClick del panel no hace nada propio: solo frena la propagacion para que un
        clic adentro no llegue al fondo y cierre el drawer. Es una preocupacion de mouse
        y no tiene equivalente de teclado, porque por teclado nunca se dispara el fondo.
      */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <aside
        aria-label="Nuevo análisis"
        className="wl-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="wl-drawer-head">
          <h2>Nuevo análisis</h2>
          <button aria-label="Cerrar" className="wl-drawer-close" onClick={onClose} type="button">×</button>
        </header>

        <div className="wl-drawer-body">
          <label className="wl-field">
            <span>ID de caso de-identificado</span>
            <input
              onChange={(event) => {
                setCaseId(event.target.value);
                setPersistedRun(null);
                setProductState(null);
              }}
              placeholder="CASE-XXXX"
              value={caseId}
            />
            {caseIdIssue
              ? <em className="wl-field-error">{caseIdIssue}</em>
              : <em>Letras, números, punto, guion, guion bajo o dos puntos.</em>}
          </label>

          <label className="wl-field">
            <span>Referencia de paciente de-identificada</span>
            <input
              onChange={(event) => setMetadata((current) => ({ ...current, subjectRef: event.target.value }))}
              placeholder="SPIDER-101"
              value={metadata.subjectRef}
            />
            <em>Código académico estable. No ingreses nombre, DNI, email ni datos identificatorios.</em>
          </label>

          <div className="wl-field-row">
            <label className="wl-field">
              <span>Fecha del estudio</span>
              <input
                onChange={(event) => setMetadata((current) => ({ ...current, studyDate: event.target.value }))}
                type="date"
                value={metadata.studyDate}
              />
            </label>
            <label className="wl-field">
              <span>Prioridad</span>
              <select
                onChange={(event) => setMetadata((current) => ({ ...current, reviewPriority: event.target.value as StudyMetadataDraft["reviewPriority"] }))}
                value={metadata.reviewPriority}
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </label>
          </div>

          <label className="wl-field">
            <span>Descripción</span>
            <input
              maxLength={200}
              onChange={(event) => setMetadata((current) => ({ ...current, description: event.target.value }))}
              placeholder="RM lumbar sagital T2"
              value={metadata.description}
            />
          </label>

          {metadataError && <p className="wl-drawer-error">{metadataError}</p>}

          <div className="wl-upload">
            <div className="wl-upload-head">
              <strong>Estudio completo</strong>
              <span>.zip · las series se separan solas</span>
            </div>
            <input accept=".zip" disabled={!caseIdReady} onChange={(event) => { void uploadStudy(event.target.files?.[0]); event.target.value = ""; }} type="file" />
            {studyUpload.status === "uploading" && <p className="wl-upload-state">Leyendo {studyUpload.fileName}…</p>}
            {studyUpload.status === "error" && <p className="wl-drawer-error">{studyUpload.error}</p>}
            {studyUpload.status === "uploaded" && studyUpload.study && (
              <div className="wl-study-result">
                {/*
                  Se listan todas las series que traía el estudio y no solo las dos
                  elegidas. El médico necesita ver qué había para entender por qué se
                  eligió lo que se eligió, y sobre todo para notar cuando falta una
                  serie que esperaba encontrar.
                */}
                <p className="wl-upload-state is-ok">
                  {studyUpload.fileName}: {studyUpload.study.seriesFound.length} series encontradas.
                </p>
                <ul className="wl-series-list">
                  {studyUpload.study.seriesFound.map((series, index) => {
                    // Se empareja por posición: el identificador de la serie no sale
                    // del backend, porque llevaría de vuelta al estudio de origen.
                    const roles = [
                      studyUpload.study?.sagittal?.seriesIndex === index ? "multiplanar sagital" : null,
                      studyUpload.study?.axial?.seriesIndex === index ? "multiplanar axial" : null,
                      studyUpload.study?.sagittalT1?.seriesIndex === index ? "P10.7 T1" : null,
                      studyUpload.study?.sagittalT2?.seriesIndex === index ? "P10.7 T2" : null,
                    ].filter((role): role is string => Boolean(role));
                    const usedFor = roles.length ? roles.join(" · ") : null;
                    return (
                      <li className={usedFor ? "is-selected" : ""} key={`${series.plane}-${series.description}-${index}`}>
                        <span>{seriesLabel(series)}</span>
                        {usedFor && <em>se analiza como {usedFor}</em>}
                      </li>
                    );
                  })}
                </ul>
                {/*
                  Las advertencias del módulo llegan tal cual: que no haya sagital, o
                  que el axial no sea T2 cuando el modelo axial fue entrenado sobre T2,
                  cambia lo que se puede concluir de la corrida.
                */}
                {studyUpload.study.warnings.map((warning) => (
                  <p className="wl-drawer-warning" key={warning}>{warning}</p>
                ))}
              </div>
            )}
          </div>

          {/*
            Camino secundario y plegado: acepta lo que el de estudio completo no puede
            recibir —un .mha o un .npy sueltos de un dataset—, donde el plano no viene
            en la metadata y lo tiene que declarar el médico.
          */}
          <div className="wl-upload">
            <button className="wl-upload-toggle" onClick={() => setByPlaneOpen((value) => !value)} type="button">
              {byPlaneOpen ? "▾" : "▸"} Cargar un archivo por plano
            </button>
            {byPlaneOpen && (["sagittal", "axial"] as Plane[]).map((plane) => (
              <div className="wl-upload-plane" key={plane}>
                <div className="wl-upload-head">
                  <strong>{planeLabel(plane)}</strong>
                  <span>{plane === "sagittal" ? "obligatorio" : "opcional · experimental"}</span>
                </div>
                <input accept={uploadAccept} disabled={!caseIdReady} onChange={(event) => onFileChange(plane, event)} type="file" />
                {uploads[plane].status === "uploading" && <p className="wl-upload-state">Cargando {uploads[plane].fileName}…</p>}
                {uploads[plane].status === "uploaded" && <p className="wl-upload-state is-ok">{uploads[plane].fileName} cargado.</p>}
                {uploads[plane].status === "error" && <p className="wl-drawer-error">{uploads[plane].error}</p>}
              </div>
            ))}
          </div>

          {productState && (
            <section className={`wl-product-progress is-${productState.phase}`} aria-live="polite">
              <strong>{productPhaseLabel[productState.phase]}</strong>
              <ul>
                {(["sagittal_t1", "sagittal_t2"] as const).map((role) => {
                  const item = productState.series[role];
                  return (
                    <li key={role}>
                      <span>{role === "sagittal_t1" ? "Sagittal T1" : "Sagittal T2"}</span>
                      <em>{productSeriesLabel(item.status)}</em>
                      {item.segmentationRunId && <small>run {item.segmentationRunId}</small>}
                      {item.status === "completed" && <small>{item.discLocalizations.length} localizaciones discales</small>}
                      {item.error && <small className="wl-field-error">{item.error}</small>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {message && <p className="wl-drawer-message">{message}</p>}
        </div>

        <footer className="wl-drawer-foot">
          <button className="wl-drawer-cancel" disabled={running} onClick={onClose} type="button">Cancelar</button>
          {persistedRun && productState?.phase === "error" && (
            <button className="wl-drawer-cancel" disabled={running} onClick={() => onAnalysisReady(persistedRun.caseId)} type="button">
              Abrir sin P10.7
            </button>
          )}
          {persistedRun && productState?.phase === "error" ? (
            <button className="wl-drawer-run" disabled={running || !productState.retryable} onClick={() => void retryProductExtensions()} type="button">
              {running ? "Reintentando…" : productState.retryable ? "Reintentar P10.7" : "P10.7 no disponible"}
            </button>
          ) : persistedRun && productState && ["completed", "degraded"].includes(productState.phase) ? (
            <button className="wl-drawer-run" disabled={running} onClick={() => onAnalysisReady(persistedRun.caseId)} type="button">
              Abrir sala de lectura
            </button>
          ) : (
            <button className="wl-drawer-run" disabled={!sagittalReady || running} onClick={() => void run()} type="button">
              {running ? "Procesando…" : "Analizar"}
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}
