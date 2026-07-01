import { useEffect, useMemo, useState } from "react";
import { getAgentReport, getHealth, getModels, isDemoMode, runPipeline, updateReview } from "./api";
import { sampleRun } from "./mock/sampleRun";
import type { AiModel, AiRunResponse, ReviewStatus } from "./types";

const reviewStatuses: ReviewStatus[] = ["pendiente", "aceptado", "observado", "descartado"];

function App() {
  const [health, setHealth] = useState("consultando");
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedRun, setSelectedRun] = useState<AiRunResponse>(sampleRun);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(sampleRun.review.status);
  const [observations, setObservations] = useState(sampleRun.review.observations);

  const worklist = useMemo(() => [selectedRun], [selectedRun]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [healthResponse, modelResponse] = await Promise.all([getHealth(), getModels()]);
        setHealth(healthResponse.status);
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
    setReviewStatus(selectedRun.review.status);
    setObservations(selectedRun.review.observations);
  }, [selectedRun]);

  async function handleRunDemo() {
    setLoading(true);
    setError("");
    try {
      const response = await runPipeline({
        caseId: sampleRun.caseId,
        plane: sampleRun.plane,
        modelKey: sampleRun.modelKey,
        imageRef: "demo/local-reference",
      });
      const report = await getAgentReport(response.runId);
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
    try {
      const review = await updateReview(selectedRun.runId, {
        status: reviewStatus,
        observations,
        reviewer: "profesional-revisor",
      });
      setSelectedRun((current) => ({
        ...current,
        review,
      }));
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
      {error && <div className="error-box">{error}</div>}

      <section className="status-grid">
        <article className="card">
          <span className="label">Backend Spring Boot</span>
          <strong>{health}</strong>
          <small>Base URL: {import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"}</small>
        </article>
        <article className="card">
          <span className="label">Modelos disponibles</span>
          <strong>{models.length}</strong>
          <small>{models.filter((model) => model.enabled).length} habilitados para uso asistivo</small>
        </article>
        <article className="card">
          <span className="label">Revision</span>
          <strong>{selectedRun.review.status}</strong>
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
                  <strong>{run.caseId}</strong>
                  <small>{run.plane} · {run.modelKey}</small>
                </span>
                <span className={`badge priority-${run.agentDecision.priority}`}>{run.agentDecision.priority}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="detail-stack">
          <article className="card detail-card">
            <div className="section-heading">
              <h2>Detalle de caso</h2>
              <span className={`badge status-${selectedRun.review.status}`}>{selectedRun.review.status}</span>
            </div>
            <div className="detail-grid">
              <div><span className="label">Run ID</span><strong>{selectedRun.runId}</strong></div>
              <div><span className="label">Caso</span><strong>{selectedRun.caseId}</strong></div>
              <div><span className="label">Plano</span><strong>{selectedRun.plane}</strong></div>
              <div><span className="label">Modelo</span><strong>{selectedRun.modelKey}</strong></div>
            </div>
          </article>

          <article className="card">
            <div className="section-heading">
              <h2>Panel agente</h2>
              <span className={`badge priority-${selectedRun.agentDecision.priority}`}>{selectedRun.agentDecision.priority}</span>
            </div>
            <p className="assistive-note">
              Estado: {selectedRun.agentDecision.status}. Requiere revision profesional:{" "}
              {selectedRun.agentDecision.humanReviewRequired ? "si" : "no"}.
            </p>
            <div className="flag-row">
              {selectedRun.agentDecision.flags.map((flag) => (
                <span className="flag" key={flag}>{flag}</span>
              ))}
            </div>
            <ul className="reason-list">
              {selectedRun.agentDecision.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </article>

          <div className="split-panels">
            <article className="card">
              <div className="section-heading">
                <h2>Evidencia visual</h2>
                <span>Overlay</span>
              </div>
              <div className="overlay-box">
                <div className="scan-frame">
                  <div className="overlay-line line-a" />
                  <div className="overlay-line line-b" />
                  <div className="overlay-area" />
                </div>
              </div>
              <p className="assistive-note">Representacion visual para revisar regiones marcadas por el pipeline tecnico.</p>
            </article>

            <article className="card">
              <div className="section-heading">
                <h2>Mediciones</h2>
                <span>{selectedRun.measurements.length}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Indicador</th>
                    <th>Valor</th>
                    <th>Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRun.measurements.map((measurement) => (
                    <tr key={measurement.id}>
                      <td>{measurement.label}</td>
                      <td>{measurement.value} {measurement.unit}</td>
                      <td>{measurement.confidence ? `${Math.round(measurement.confidence * 100)}%` : "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </div>

          <article className="card review-card">
            <div className="section-heading">
              <h2>Revision profesional</h2>
              <span>Human-in-the-loop</span>
            </div>
            <label>
              Estado
              <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}>
                {reviewStatuses.map((status) => (
                  <option value={status} key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Observaciones
              <textarea
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
