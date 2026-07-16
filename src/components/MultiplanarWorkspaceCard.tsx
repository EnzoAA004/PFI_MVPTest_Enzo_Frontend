import { useEffect, useState, type ChangeEvent } from "react";
import { BackendApiError, getMultiplanarContract, runMultiplanarAnalysis, syncRealModelArtifacts, uploadAiInput } from "../multiplanarApi";
import type { InputResponse, MultiplanarRunResponse } from "../multiplanarRunTypes";
import { panelOrder, readyPlaneCount, type MultiplanarContract } from "../multiplanarTypes";
import type { Plane } from "../appTypes";
import { MultiplanarReviewView } from "./MultiplanarReviewView";
import { StatusBadge } from "./StatusBadge";

const allowedInputExtensions = [".npy", ".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".mha", ".mhd", ".dcm"];
const uploadAccept = allowedInputExtensions.join(",");
const uploadPlanes: Plane[] = ["sagittal", "axial"];

type PlaneUploadState = {
  fileName?: string;
  status: "idle" | "uploading" | "uploaded" | "error";
  input?: InputResponse;
  error?: string;
};

const emptyUploadState: Record<Plane, PlaneUploadState> = {
  sagittal: { status: "idle" },
  axial: { status: "idle" },
};

function labelForPanel(panel: string) {
  if (panel === "sagittal") return "Sagital";
  if (panel === "axial") return "Axial";
  return "3D futuro";
}

function hasAllowedExtension(fileName: string) {
  const lowerName = fileName.toLowerCase();
  return allowedInputExtensions.some((extension) => lowerName.endsWith(extension));
}

function uploadErrorMessage(error: unknown) {
  if (error instanceof BackendApiError) return `Backend respondio ${error.status} al cargar el archivo (${error.path}).`;
  if (error instanceof Error) return error.message;
  return "No se pudo cargar el archivo.";
}

export function MultiplanarWorkspaceCard({ caseId }: { caseId?: string | null }) {
  const [contract, setContract] = useState<MultiplanarContract | null>(null);
  const [lastRun, setLastRun] = useState<MultiplanarRunResponse | null>(null);
  const [uploadedInputs, setUploadedInputs] = useState<Record<Plane, PlaneUploadState>>(emptyUploadState);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh(clearMessage = true) {
    setLoading(true);
    if (clearMessage) setMessage("");
    try {
      setContract(await getMultiplanarContract());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo consultar contrato multiplanar");
      setContract({ status: "multiplanar_unavailable", workspaceMode: "dual_plane_with_3d_context", humanReviewRequired: true, notClinicalDiagnosis: true });
    } finally {
      setLoading(false);
    }
  }

  async function syncModels() {
    setSyncing(true);
    setMessage("Sincronizando modelos reales desde artifact externo...");
    try {
      const result = await syncRealModelArtifacts(false);
      setMessage(`Sync finalizado: ${String(result.status ?? "sin_estado")}. Modo=${String(result.defaultInferenceMode ?? "contract")}`);
      await refresh(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo sincronizar modelos reales");
    } finally {
      setSyncing(false);
    }
  }

  async function handleUpload(plane: Plane, file?: File) {
    if (!caseId || !file) return;
    if (!hasAllowedExtension(file.name)) {
      setUploadedInputs((current) => ({
        ...current,
        [plane]: {
          fileName: file.name,
          status: "error",
          error: `Extension no permitida. Usar: ${allowedInputExtensions.join(", ")}`,
        },
      }));
      return;
    }

    setUploadedInputs((current) => ({
      ...current,
      [plane]: { fileName: file.name, status: "uploading" },
    }));
    try {
      const input = await uploadAiInput(file, caseId, plane);
      setUploadedInputs((current) => ({
        ...current,
        [plane]: { fileName: file.name, status: "uploaded", input },
      }));
      setMessage(`${labelForPanel(plane)} cargado: ${input.inputId}`);
    } catch (error) {
      setUploadedInputs((current) => ({
        ...current,
        [plane]: { fileName: file.name, status: "error", error: uploadErrorMessage(error) },
      }));
    }
  }

  function handleFileChange(plane: Plane, event: ChangeEvent<HTMLInputElement>) {
    void handleUpload(plane, event.target.files?.[0]);
    event.target.value = "";
  }

  async function runAnalysis() {
    if (!caseId) {
      setMessage("Seleccioná un estudio de la worklist antes de ejecutar el workspace multiplanar.");
      return;
    }
    setRunning(true);
    const inferenceMode = contract?.readyForRealBaseline ? "real_baseline" : "contract";
    setMessage(`Ejecutando ${caseId} en modo solicitado ${inferenceMode}...`);
    try {
      const result = await runMultiplanarAnalysis({
        caseId,
        sagittalInputPath: `demo/${caseId}/sagittal`,
        axialInputPath: `demo/${caseId}/axial`,
        sagittalModelKey: "sagittal_spider",
        axialModelKey: "axial_t2_alkafri",
        metadata: {
          source: "frontend-multiplanar-workspace",
          inferenceMode,
          selectedFromWorkspace: true,
        },
      });
      setLastRun(result);
      setMessage(`Run ${String(result.runId ?? "sin_id")} finalizado. Solicitado=${String(result.requestedInferenceMode ?? inferenceMode)} · efectivo=${String(result.effectiveInferenceMode ?? "contract")}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo ejecutar análisis multiplanar");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    setLastRun(null);
    setUploadedInputs(emptyUploadState);
    if (caseId) void refresh();
    else {
      setContract(null);
      setMessage("");
    }
  }, [caseId]);

  const ready = readyPlaneCount(contract ?? undefined);
  const status = String(contract?.status ?? "consultando");
  const planes = contract?.planes ?? {};

  if (!caseId) {
    return (
      <section className="panel-card compact-card">
        <div className="section-title">
          <h2>Workspace multiplanar</h2>
          <StatusBadge tone="amber">sin caso</StatusBadge>
        </div>
        <p className="muted compact-copy">
          Seleccioná un estudio en la worklist para vincular este workspace a un caso real.
        </p>
        <div className="panel-hidden-placeholder">No hay caso seleccionado. El workspace no usa un demo silencioso.</div>
      </section>
    );
  }

  return (
    <>
      <section className="panel-card compact-card">
        <div className="section-title">
          <h2>Workspace multiplanar</h2>
          <StatusBadge tone={ready === 2 ? "green" : ready === 1 ? "amber" : "blue"}>{ready}/2 modelos</StatusBadge>
        </div>
        <p className="muted compact-copy">
          Base técnica para visualizar sagital, axial y reconstrucción 3D futura con máscaras, landmarks y mediciones sincronizadas.
        </p>
        {message && <div className="toast info">{message}</div>}
        <dl className="info-list compact-info">
          <div><dt>Caso</dt><dd>{caseId}</dd></div>
          <div><dt>Estado</dt><dd>{status}</dd></div>
          <div><dt>Modo</dt><dd>{String(contract?.workspaceMode ?? "dual_plane_with_3d_context")}</dd></div>
          <div><dt>Revisión humana</dt><dd>{contract?.humanReviewRequired === false ? "no" : "sí"}</dd></div>
        </dl>
        <div className="comparison-table unified-results-table ai-completion-table">
          <div className="comparison-head"><span>Entrada RM</span><span>Subida</span></div>
          {uploadPlanes.map((plane) => {
            const upload = uploadedInputs[plane];
            const disabled = loading || syncing || running || upload.status === "uploading";
            return (
              <div className="comparison-row compact-comparison-row" key={plane}>
                <span>
                  <strong>{labelForPanel(plane)}</strong>
                  <small>{upload.fileName ?? "sin archivo seleccionado"}</small>
                </span>
                <span>
                  <input aria-label={`Cargar RM ${labelForPanel(plane)}`} accept={uploadAccept} disabled={disabled} onChange={(event) => handleFileChange(plane, event)} type="file" />
                  {upload.status === "uploading" && <progress aria-label={`Subiendo ${labelForPanel(plane)}`} />}
                  {upload.status === "uploaded" && <small>inputId: {upload.input?.inputId}</small>}
                  {upload.status === "error" && <small className="delta-alert">{upload.error}</small>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="comparison-table unified-results-table ai-completion-table">
          <div className="comparison-head"><span>Panel</span><span>Preparación</span></div>
          {panelOrder().map((panel) => {
            const plane = panel === "three_d" ? undefined : planes[panel];
            const detail = panel === "three_d"
              ? String(contract?.threeD?.status ?? "planned_from_registered_masks")
              : `${plane?.readiness ?? "pendiente"}${plane?.baselineReady ? " / baseline listo" : ""}`;
            return <div className="comparison-row compact-comparison-row" key={panel}><span>{labelForPanel(panel)}</span><span>{detail}</span></div>;
          })}
        </div>
        <div className="diagnostics-actions">
          <button className="ghost-button" disabled={loading || syncing || running} onClick={() => void refresh()} type="button">Actualizar workspace</button>
          <button className="ghost-button" disabled={loading || syncing || running} onClick={() => void syncModels()} type="button">Sincronizar modelos reales</button>
          <button className="primary-button" disabled={loading || syncing || running} onClick={() => void runAnalysis()} type="button">{running ? "Ejecutando..." : "Ejecutar análisis multiplanar"}</button>
        </div>
      </section>
      {lastRun && <MultiplanarReviewView run={lastRun} />}
    </>
  );
}
