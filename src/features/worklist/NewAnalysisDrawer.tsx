import { useState, type ChangeEvent } from "react";
import { BackendApiError, runMultiplanarAnalysis, uploadAiInput } from "../../multiplanarApi";
import type { Plane } from "../../appTypes";
import type { InputResponse } from "../../contracts/inputApiTypes";
import type { MultiplanarRunPayload } from "../../contracts/multiplanarHttpTypes";
import { evaluateRealInferenceReadiness } from "../../inferenceReadiness";
import {
  emptyStudyMetadataDraft,
  normalizeStudyMetadataInput,
  subjectRefErrorMessage,
  validateSubjectRef,
  type StudyMetadataDraft,
} from "../../studyMetadata";

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

function apiErrorMessage(error: unknown, action: string) {
  if (error instanceof BackendApiError) {
    return `No se pudo ${action}: ${error.message}`;
  }
  return error instanceof Error ? `No se pudo ${action}: ${error.message}` : `No se pudo ${action}.`;
}

export function NewAnalysisDrawer({ onClose, onAnalysisReady }: Props) {
  const [caseId, setCaseId] = useState("");
  const [metadata, setMetadata] = useState<StudyMetadataDraft>(() => emptyStudyMetadataDraft());
  const [metadataError, setMetadataError] = useState("");
  const [uploads, setUploads] = useState<Record<Plane, UploadState>>(emptyUploads);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const normalizedCaseId = caseId.trim();
  const sagittalReady = Boolean(normalizedCaseId && uploads.sagittal.input?.inputId);
  const axialReady = Boolean(uploads.axial.input?.inputId);

  async function upload(plane: Plane, file?: File) {
    if (!file) return;
    if (!normalizedCaseId) {
      setMessage("Ingresá un identificador de caso de-identificado antes de cargar archivos.");
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
        sagittalInputId: uploads.sagittal.input?.inputId ?? "",
        sagittalModelKey: "sagittal_spider",
        allowContractFallback: false,
        metadata: {
          source: "frontend-worklist-drawer",
          uiFlow: "worklist-new-analysis",
          inferenceMode: "real_baseline",
          requestedInferenceMode: "real_baseline",
          allowContractFallback: false,
          axialMode: axialReady ? "experimental_requested" : "optional_not_provided",
        },
        ...(axialReady ? { axialInputId: uploads.axial.input?.inputId, axialModelKey: "axial_t2_alkafri" } : {}),
      };
      const result = await runMultiplanarAnalysis(payload);
      const readiness = evaluateRealInferenceReadiness(result);
      if (readiness.ready) {
        onAnalysisReady(normalizedCaseId);
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
    <div className="wl-drawer-backdrop" role="presentation" onClick={onClose}>
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
            <input onChange={(event) => setCaseId(event.target.value)} placeholder="CASE-XXXX" value={caseId} />
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

          {(["sagittal", "axial"] as Plane[]).map((plane) => (
            <div className="wl-upload" key={plane}>
              <div className="wl-upload-head">
                <strong>{planeLabel(plane)}</strong>
                <span>{plane === "sagittal" ? "obligatorio" : "opcional · experimental"}</span>
              </div>
              <input accept={uploadAccept} disabled={!normalizedCaseId} onChange={(event) => onFileChange(plane, event)} type="file" />
              {uploads[plane].status === "uploading" && <p className="wl-upload-state">Cargando {uploads[plane].fileName}…</p>}
              {uploads[plane].status === "uploaded" && <p className="wl-upload-state is-ok">{uploads[plane].fileName} cargado.</p>}
              {uploads[plane].status === "error" && <p className="wl-drawer-error">{uploads[plane].error}</p>}
            </div>
          ))}

          {message && <p className="wl-drawer-message">{message}</p>}
        </div>

        <footer className="wl-drawer-foot">
          <button className="wl-drawer-cancel" onClick={onClose} type="button">Cancelar</button>
          <button className="wl-drawer-run" disabled={!sagittalReady || running} onClick={() => void run()} type="button">
            {running ? "Procesando…" : "Analizar"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
