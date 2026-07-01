import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAgentReport, getHealth, getModels, isDemoMode, normalizeRun, runPipeline, updateReview } from "./api";
import { sampleRun } from "./mock/sampleRun";
import type { AgentDecision, AiModel, AiRunResponse, ReviewStatus, ReviewStatusResponse } from "./types";

const reviewStatuses: ReviewStatus[] = ["pendiente", "aceptado", "observado", "descartado"];
const isRemoteUrl = (value?: string) => Boolean(value && /^https?:\/\//i.test(value));
const fallbackRunId = "demo-run-2026-001";
const fallbackReview: ReviewStatusResponse = {
  runId: fallbackRunId,
  status: "pendiente",
  observations: "",
};
const fallbackAgentDecision: AgentDecision = {
  priority: "media",
  status: "requiere_revision",
  flags: ["revision_profesional_requerida"],
  reasons: ["La salida tecnica debe ser revisada por un profesional."],
  humanReviewRequired: true,
};

function App() {
  const [health, setHealth] = useState("consultando");
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedRun, setSelectedRun] = useState<AiRunResponse>(sampleRun);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [overlayFailed, setOverlayFailed] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(sampleRun.review?.status ?? "pendiente");
  const [observations, setObservations] = useState(sampleRun.review?.observations ?? "");

  const safeRun = useMemo(() => normalizeRun(selectedRun), [selectedRun]);
  const agentDecision = safeRun.agentDecision ?? sampleRun.agentDecision ?? fallbackAgentDecision;
  const measurements = safeRun.measurements ?? [];
  const review = safeRun.review ?? sampleRun.review ?? fallbackReview;
  const runId = safeRun.runId ?? sampleRun.runId ?? fallbackRunId;
  const caseId = safeRun.caseId ?? sampleRun.caseId;
  const humanReviewRequired = agentDecision.humanReviewRequired !== false;
  const worklist = useMemo(() => [safeRun], [safeRun]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [healthResponse, modelResponse] = await Promise.all([getHealth(), getModels()]);
        setHealth(healthResponse.status ?? "sin_estado");
        setModels(modelResponse);
      } catch (bootstrapError) {
        setError(bootstrapError instanceof Error ? bootstrapError.message : "No se pudo consultar el backend");
      } finally {
        setDemoMode(isDemoMode());
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    setReviewStatus(review.status ?? "pendiente");
    setObservations(review.observations ?? "");
    setOverlayFailed(false);
  }, [review.status, review.observations, safeRun.overlayPath]);

  async function handleRunDemo() {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const response = await runPipeline({
        caseId: sampleRun.caseId ?? "CASE-DEMO-0142",
        plane: sampleRun.plane ?? "sagittal",
        modelKey: sampleRun.modelKey ?? "pfi-segmentation-sagittal-v1",
        imageRef: "demo/local-reference",
      });
      const report = await getAgentReport(response.runId ?? sampleRun.runId ?? fallbackRunId);
      setSelectedRun(report);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "No se pudo ejecutar el caso demo");
    } finally {
      setDemoMode(isDemoMode());
      setLoading(false);
    }
  }

  async function handleSaveReview() {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const updatedReview = await updateReview(runId, {
        status: reviewStatus,
        observations,
        reviewer: "profesional-revisor",
      });
      setSelectedRun((current) => ({
        ...current,
        review: updatedReview,
      }));
      if (isDemoMode()) {
        setInfo("Revision guardada en modo demo local porque el backend no confirmo la operacion.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la revision");
    } finally {
      setDemoMode(isDemoMode());
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PFI MVP Frontend</p>
          <h1>Worklist y revision asistiva</h1>
        </div>
        <button className="primary-action" onClick={handleRunDemo} disabled={loading}>
          {loading ? "Ejecutando..." : "Ejecutar caso demo"}
        </button>
      </header>

      <section className="method-banner">
        <strong>Salida asistiva. Requiere revision profesional.</strong>
        <span>Apoyo tecnico para evidencia visual, mediciones revisables y priorizacion human-in-the-loop.</span>
      </section>

      {demoMode && <div className="notice">Modo demo local activo: el backend no respondio o VITE_USE_MOCK=true.</div>}
      {info && <div className="notice">{info}</div>}
      {error && <div className="error-box">{error}</div>}

      <section className="status-grid">
        <article className="card">
          <span className="label">Backend Spring Boot</span>
          <strong>{health}</strong>
          <small>Base URL: {API_BASE_URL}</small>
        </article>
        <article className="card">
          <span className="label">Modelos disponibles</span>
          <strong>{models.length}</strong>
          <small>{models.filter((model) => model.enabled !== false).length} habilitados para uso asistivo</small>
        </article>
        <article className="card">
          <span className="label">Revision</span>
          <strong>{review.status}</strong>
          <small>Validacion profesional obligatoria</small>
        </article>
      </section>

      <section className="dashboard">
        <aside className="worklist card">
          <div className="section-heading">
            <h2>Worklist</h2>
            <span>{worklist.length} caso</span>
          </div>
          <div className="case-list">
            {worklist.map((run) => (
              <button key={run.runId} className="case-row active" onClick={() => setSelectedRun(run)}>
                <span>
                  <strong>{run.caseId ?? "caso-demo"}</strong>
                  <small>{run.plane ?? "sagittal"} - {run.modelKey ?? "modelo-demo"}</small>
                </span>
                <span className={`badge priority-${run.agentDecision?.priority ?? "media"}`}>{run.agentDecision?.priority ?? "media"}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="detail-stack">
          <article className="card detail-card">
            <div className="section-heading">
              <h2>Detalle de caso</h2>
              <span className={`badge status-${review.status ?? "pendiente"}`}>{review.status ?? "pendiente"}</span>
            </div>
            <div className="detail-grid">
              <div><span className="label">Run ID</span><strong>{runId}</strong></div>
              <div><span className="label">Caso</span><strong>{caseId}</strong></div>
              <div><span className="label">Plano</span><strong>{safeRun.plane ?? "sagittal"}</strong></div>
              <div><span className="label">Modelo</span><strong>{safeRun.modelKey ?? "modelo-demo"}</strong></div>
            </div>
          </article>

          <article className="card">
            <div className="section-heading">
              <h2>Panel agente</h2>
              <div className="badge-row">
                <span className={`badge priority-${agentDecision.priority ?? "media"}`}>{agentDecision.priority ?? "media"}</span>
                <span className={humanReviewRequired ? "badge review-required" : "badge review-optional"}>
                  {humanReviewRequired ? "revision requerida" : "revision registrada"}
                </span>
              </div>
            </div>
            <p className="assistive-note">
              Estado: {agentDecision.status ?? "requiere_revision"}. Requiere revision profesional:{" "}
              {humanReviewRequired ? "si" : "no"}.
            </p>
            <div className="flag-row">
              {(agentDecision.flags ?? []).map((flag) => (
                <span className="flag" key={flag}>{flag}</span>
              ))}
            </div>
            <ul className="reason-list">
              {(agentDecision.reasons ?? []).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </article>

          <div className="split-panels">
            <article className="card">
              <div className="section-heading">
                <h2>Evidencia visual</h2>
                <span>{safeRun.overlayPath ? "Overlay disponible" : "Sin overlay"}</span>
              </div>
              {isRemoteUrl(safeRun.overlayPath) && !overlayFailed ? (
                <img className="overlay-image" src={safeRun.overlayPath} alt="Overlay de evidencia visual" onError={() => setOverlayFailed(true)} />
              ) : (
                <div className="overlay-box">
                  <div className="scan-frame">
                    <div className="overlay-line line-a" />
                    <div className="overlay-line line-b" />
                    <div className="overlay-area" />
                  </div>
                  {safeRun.overlayPath && (
                    <code className="overlay-path">Ruta de overlay local/no accesible desde navegador: {safeRun.overlayPath}</code>
                  )}
                </div>
              )}
              <p className="assistive-note">Representacion visual para revisar regiones marcadas por el pipeline tecnico.</p>
            </article>

            <article className="card">
              <div className="section-heading">
                <h2>Mediciones</h2>
                <span>{measurements.length}</span>
              </div>
              {measurements.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Valor</th>
                      <th>Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.map((measurement, index) => (
                      <tr key={measurement.id ?? `measurement-${index}`}>
                        <td>{measurement.label ?? "Indicador tecnico"}</td>
                        <td>{measurement.value ?? "N/A"} {measurement.unit ?? ""}</td>
                        <td>{measurement.confidence ? `${Math.round(measurement.confidence * 100)}%` : "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="assistive-note">No hay mediciones disponibles para este reporte.</p>
              )}
            </article>
          </div>

          <article className="card review-card">
            <div className="section-heading">
              <h2>Revision profesional</h2>
              <span>Human-in-the-loop</span>
            </div>
            <label htmlFor="review-status">
              Estado
              <select id="review-status" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}>
                {reviewStatuses.map((status) => (
                  <option value={status} key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label htmlFor="review-observations">
              Observaciones
              <textarea
                id="review-observations"
                value={observations}
                onChange={(event) => setObservations(event.target.value)}
                placeholder="Registrar observaciones tecnicas de la revision profesional"
              />
            </label>
            <button className="primary-action" onClick={handleSaveReview} disabled={saving}>
              {saving ? "Guardando..." : "Guardar revision"}
            </button>
          </article>
        </section>
      </section>
    </main>
  );
}

export default App;
