import { useEffect, useState, type ChangeEvent } from "react";
import { aiAssetUrl, BackendApiError, getMultiplanarContract, runMultiplanarAnalysis, syncRealModelArtifacts, uploadAiInput } from "../multiplanarApi";
import type { InputResponse, MultiplanarRunResponse } from "../multiplanarRunTypes";
import { panelOrder, readyPlaneCount, type MultiplanarContract } from "../multiplanarTypes";
import type { Plane } from "../appTypes";
import { StatusBadge } from "./StatusBadge";

const allowedInputExtensions = [".npy", ".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".mha", ".mhd", ".dcm"];
const uploadAccept = allowedInputExtensions.join(",");
const uploadPlanes: Plane[] = ["sagittal", "axial"];
const defaultOverlayOpacity: Record<Plane, number> = { sagittal: 0.65, axial: 0.65 };

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

function apiErrorMessage(error: unknown, action: string) {
  if (error instanceof BackendApiError) return `Backend respondio ${error.status} al ${action} (${error.path}).`;
  if (error instanceof Error) return error.message;
  return `No se pudo ${action}.`;
}

export function MultiplanarWorkspaceCard({ caseId }: { caseId?: string | null }) {
  const [contract, setContract] = useState<MultiplanarContract | null>(null);
  const [lastRun, setLastRun] = useState<MultiplanarRunResponse | null>(null);
  const [failedAssetUrls, setFailedAssetUrls] = useState<Record<string, boolean>>({});
  const [overlayOpacity, setOverlayOpacity] = useState<Record<Plane, number>>(defaultOverlayOpacity);
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
        [plane]: { fileName: file.name, status: "error", error: apiErrorMessage(error, "cargar el archivo") },
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
    const sagittalInputId = uploadedInputs.sagittal.input?.inputId;
    const axialInputId = uploadedInputs.axial.input?.inputId;
    if (!sagittalInputId || !axialInputId) {
      setMessage("Cargá inputs sagital y axial antes de ejecutar el análisis multiplanar.");
      return;
    }
    setRunning(true);
    const inferenceMode = contract?.readyForRealBaseline ? "real_baseline" : "contract";
    setMessage(`Ejecutando ${caseId} en modo solicitado ${inferenceMode}...`);
    try {
      const result = await runMultiplanarAnalysis({
        caseId,
        sagittalInputId,
        axialInputId,
        sagittalModelKey: "sagittal_spider",
        axialModelKey: "axial_t2_alkafri",
        allowContractFallback: false,
        metadata: {
          source: "frontend-multiplanar-workspace",
          inferenceMode,
          selectedFromWorkspace: true,
        },
      });
      setFailedAssetUrls({});
      setLastRun(result);
      setMessage(`Run ${String(result.runId ?? "sin_id")} finalizado. Solicitado=${String(result.requestedInferenceMode ?? inferenceMode)} · efectivo=${String(result.effectiveInferenceMode ?? "contract")}`);
    } catch (error) {
      setMessage(apiErrorMessage(error, "ejecutar análisis multiplanar"));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    setLastRun(null);
    setFailedAssetUrls({});
    setOverlayOpacity(defaultOverlayOpacity);
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
  const canRunAnalysis = Boolean(uploadedInputs.sagittal.input?.inputId && uploadedInputs.axial.input?.inputId);

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
        {lastRun && (
          <div className="comparison-table unified-results-table ai-completion-table">
            <div className="comparison-head"><span>Run multiplanar</span><span>Resumen</span></div>
            <div className="comparison-row compact-comparison-row"><span>runId</span><span>{lastRun.runId}</span></div>
            <div className="comparison-row compact-comparison-row"><span>traceId</span><span>{lastRun.traceId ?? "sin trace"}</span></div>
            <div className="comparison-row compact-comparison-row"><span>Modo workspace</span><span>{lastRun.effectiveInferenceMode}</span></div>
            {uploadPlanes.map((plane) => {
              const planeRun = lastRun.planes?.[plane];
              return (
                <div className="comparison-row compact-comparison-row" key={`run-${plane}`}>
                  <span>{labelForPanel(plane)}</span>
                  <span>{planeRun ? `runId: ${planeRun.runId} · modo: ${planeRun.effectiveInferenceMode}` : "sin run de plano"}</span>
                </div>
              );
            })}
          </div>
        )}
        {lastRun && (
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: 14 }}>
            {uploadPlanes.map((plane) => {
              const planeRun = lastRun.planes?.[plane];
              if (!planeRun) {
                return (
                  <article className="panel-card compact-card" key={`viewer-${plane}`}>
                    <div className="section-title">
                      <h3>{labelForPanel(plane)}</h3>
                      <StatusBadge tone="amber">no disponible</StatusBadge>
                    </div>
                    <div className="panel-hidden-placeholder">Plano no disponible en este run.</div>
                  </article>
                );
              }
              const inputUrl = aiAssetUrl(planeRun.runId, plane, "input.png");
              const overlayUrl = aiAssetUrl(planeRun.runId, plane, "overlay.png");
              const inputFailed = failedAssetUrls[inputUrl];
              const overlayFailed = failedAssetUrls[overlayUrl];
              return (
                <article className="panel-card compact-card" key={`viewer-${plane}`}>
                  <div className="section-title">
                    <h3>{labelForPanel(plane)}</h3>
                    <StatusBadge tone={planeRun.effectiveInferenceMode === "real_baseline" ? "green" : "blue"}>{planeRun.effectiveInferenceMode}</StatusBadge>
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid var(--border-color, #d7dde5)", borderRadius: 8, minHeight: 240, overflow: "hidden", position: "relative" }}>
                    {inputFailed ? (
                      <div className="panel-hidden-placeholder" style={{ minHeight: 240 }}>input.png no disponible desde backend.</div>
                    ) : (
                      <img alt={`${labelForPanel(plane)} input`} onError={() => setFailedAssetUrls((current) => ({ ...current, [inputUrl]: true }))} src={inputUrl} style={{ display: "block", height: "100%", maxHeight: 360, objectFit: "contain", width: "100%" }} />
                    )}
                    {!inputFailed && !overlayFailed && (
                      <img alt={`${labelForPanel(plane)} overlay`} onError={() => setFailedAssetUrls((current) => ({ ...current, [overlayUrl]: true }))} src={overlayUrl} style={{ height: "100%", inset: 0, maxHeight: 360, objectFit: "contain", opacity: overlayOpacity[plane], pointerEvents: "none", position: "absolute", width: "100%" }} />
                    )}
                  </div>
                  {overlayFailed && <div className="panel-hidden-placeholder">overlay.png no disponible desde backend.</div>}
                  <label className="compact-copy" style={{ display: "grid", gap: 6, marginTop: 10 }}>
                    <span>Opacidad overlay: {Math.round(overlayOpacity[plane] * 100)}%</span>
                    <input max="1" min="0" onChange={(event) => setOverlayOpacity((current) => ({ ...current, [plane]: Number(event.target.value) }))} step="0.05" type="range" value={overlayOpacity[plane]} />
                  </label>
                  <dl className="info-list compact-info">
                    <div><dt>Run plano</dt><dd>{planeRun.runId}</dd></div>
                    <div><dt>Modo efectivo</dt><dd>{planeRun.effectiveInferenceMode}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
        )}
        <div className="diagnostics-actions">
          <button className="ghost-button" disabled={loading || syncing || running} onClick={() => void refresh()} type="button">Actualizar workspace</button>
          <button className="ghost-button" disabled={loading || syncing || running} onClick={() => void syncModels()} type="button">Sincronizar modelos reales</button>
          <button className="primary-button" disabled={loading || syncing || running || !canRunAnalysis} onClick={() => void runAnalysis()} type="button">{running ? "Ejecutando..." : "Ejecutar análisis"}</button>
        </div>
      </section>
    </>
  );
}
