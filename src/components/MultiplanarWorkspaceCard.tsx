import { useEffect, useState, type ChangeEvent } from "react";
import { aiAssetUrl, BackendApiError, getMultiplanarContract, runMultiplanarAnalysis, syncRealModelArtifacts, uploadAiInput } from "../multiplanarApi";
import type { MultiplanarLandmark, MultiplanarMeasurementValue, MultiplanarPlaneRun, InputResponse, MultiplanarRunResponse } from "../multiplanarRunTypes";
import { panelOrder, readyPlaneCount, type MultiplanarContract } from "../multiplanarTypes";
import type { Plane } from "../appTypes";
import { StatusBadge } from "./StatusBadge";

const allowedInputExtensions = [".npy", ".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".mha", ".mhd", ".dcm"];
const uploadAccept = allowedInputExtensions.join(",");
const uploadPlanes: Plane[] = ["sagittal", "axial"];
const defaultOverlayOpacity: Record<Plane, number> = { sagittal: 0.65, axial: 0.65 };
const modelSpaceSize = 256;

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pointFromUnknown(value: unknown): { x: number; y: number } | undefined {
  const record = asRecord(value);
  const x = asNumber(record.x);
  const y = asNumber(record.y);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

function landmarkPoint(landmark: MultiplanarLandmark): { x: number; y: number } | undefined {
  const direct = pointFromUnknown(landmark);
  if (direct) return direct;
  const centroid = pointFromUnknown(landmark.centroid);
  if (centroid) return centroid;
  const center = pointFromUnknown(landmark.center);
  if (center) return center;
  const record = asRecord(landmark);
  const centroidX = asNumber(record.centroidX ?? record.cx ?? record.x_px);
  const centroidY = asNumber(record.centroidY ?? record.cy ?? record.y_px);
  if (centroidX !== undefined && centroidY !== undefined) return { x: centroidX, y: centroidY };
  const coordinates = Array.isArray(record.coordinates) ? record.coordinates : Array.isArray(record.point) ? record.point : undefined;
  if (!coordinates) return undefined;
  const x = asNumber(coordinates[0]);
  const y = asNumber(coordinates[1]);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

function landmarkLabel(landmark: MultiplanarLandmark, index: number): string {
  return String(landmark.label ?? landmark.classLabel ?? landmark.className ?? landmark.classId ?? landmark.id ?? `LM-${index + 1}`);
}

function normalizedLandmarks(landmarks?: MultiplanarLandmark[]) {
  return (landmarks ?? []).flatMap((landmark, index) => {
    const point = landmarkPoint(landmark);
    if (!point) return [];
    return [{
      key: String(landmark.id ?? `${landmarkLabel(landmark, index)}-${index}`),
      label: landmarkLabel(landmark, index),
      left: Math.max(0, Math.min(100, (point.x / modelSpaceSize) * 100)),
      top: Math.max(0, Math.min(100, (point.y / modelSpaceSize) * 100)),
      coordinateSpace: String(landmark.coordinateSpace ?? "model_space_256"),
    }];
  });
}

function measurementRows(planeRun: MultiplanarPlaneRun): MultiplanarMeasurementValue[] {
  if (Array.isArray(planeRun.measurements)) return planeRun.measurements;
  return planeRun.measurements?.values ?? [];
}

function measurementCoordinateSpace(planeRun: MultiplanarPlaneRun, row?: MultiplanarMeasurementValue): string {
  const measurementsCoordinateSpace = !Array.isArray(planeRun.measurements) ? planeRun.measurements?.coordinateSpace : undefined;
  return String(row?.coordinateSpace ?? measurementsCoordinateSpace ?? planeRun.coordinateSpace ?? "model_space_256");
}

function measurementsDerivedFromMask(planeRun: MultiplanarPlaneRun): boolean {
  const measurements = Array.isArray(planeRun.measurements) ? undefined : planeRun.measurements;
  return planeRun.measurementsDerivedFromPredictionMask ?? measurements?.measurementsDerivedFromPredictionMask ?? measurements?.measurementsDerivedFromContours ?? true;
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
              const landmarks = normalizedLandmarks(planeRun.landmarks);
              const rows = measurementRows(planeRun);
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
                    {!inputFailed && landmarks.map((landmark) => (
                      <span
                        aria-label={`${labelForPanel(plane)} landmark ${landmark.label}`}
                        key={landmark.key}
                        title={`${landmark.label} · ${landmark.coordinateSpace}`}
                        style={{
                          alignItems: "center",
                          background: "#ffffff",
                          border: "2px solid #0f766e",
                          borderRadius: "999px",
                          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.22)",
                          color: "#0f172a",
                          display: "flex",
                          fontSize: 10,
                          fontWeight: 800,
                          height: 20,
                          justifyContent: "center",
                          left: `${landmark.left}%`,
                          lineHeight: 1,
                          position: "absolute",
                          top: `${landmark.top}%`,
                          transform: "translate(-50%, -50%)",
                          width: 20,
                        }}
                      >
                        {landmark.label.slice(0, 2)}
                      </span>
                    ))}
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
                  <div className="table-wrap" style={{ marginTop: 10 }}>
                    <table className="worklist-table">
                      <thead>
                        <tr>
                          <th>Medición</th>
                          <th>Valor</th>
                          <th>Unidad</th>
                          <th>Nivel/eje</th>
                          <th>Coordinate space</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length ? rows.map((row, index) => {
                          const label = String(row.label ?? row.classLabel ?? row.className ?? row.id ?? `Medición ${index + 1}`);
                          const levelAxis = [row.level, row.axis].filter(Boolean).map(String).join(" / ");
                          return (
                            <tr key={String(row.id ?? `${label}-${index}`)}>
                              <td>{label}</td>
                              <td>{String(row.value ?? "N/A")}</td>
                              <td>{String(row.unit ?? "")}</td>
                              <td>{levelAxis || "N/A"}</td>
                              <td>{measurementCoordinateSpace(planeRun, row)}</td>
                            </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan={5}>Sin mediciones disponibles para este plano.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted compact-copy">
                    Mediciones automáticas derivadas de la máscara del modelo: {measurementsDerivedFromMask(planeRun) ? "sí" : "no"}. Requieren revisión profesional; no constituyen diagnóstico.
                  </p>
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
