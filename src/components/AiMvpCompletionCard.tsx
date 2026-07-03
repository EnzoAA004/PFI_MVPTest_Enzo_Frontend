import { useEffect, useState } from "react";
import { getAiCompletion, getAiEvaluationContract, getAiEvaluationSummary, getAiRoadmap } from "../api";
import { StatusBadge } from "./StatusBadge";

type ApiState = {
  completion?: Record<string, unknown>;
  roadmap?: Record<string, unknown>;
  evaluationContract?: Record<string, unknown>;
  evaluationSummary?: Record<string, unknown>;
};

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function metricLabels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const metric = item as Record<string, unknown>;
      const key = String(metric.key ?? "metric");
      const category = metric.category ? ` (${String(metric.category)})` : "";
      return `${key}${category}`;
    }
    return String(item);
  });
}

function toneForPercent(value: number) {
  if (value >= 85) return "green";
  if (value >= 60) return "amber";
  return "blue";
}

export function AiMvpCompletionCard() {
  const [state, setState] = useState<ApiState>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    setMessage("");
    try {
      const [completion, roadmap, evaluationContract, evaluationSummary] = await Promise.all([
        getAiCompletion(),
        getAiRoadmap(),
        getAiEvaluationContract(),
        getAiEvaluationSummary(),
      ]);
      setState({ completion, roadmap, evaluationContract, evaluationSummary });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo consultar completitud del MVP");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const percent = asNumber(state.completion?.completionPercent);
  const completed = asStringArray(state.roadmap?.completed);
  const pending = asStringArray(state.roadmap?.pending);
  const criteria = asStringArray(state.roadmap?.acceptanceCriteria);
  const metrics = metricLabels(state.evaluationContract?.metrics);
  const requiredEvidence = asStringArray(state.evaluationContract?.requiredEvidence);
  const reportCount = asNumber(state.evaluationSummary?.reportCount);

  return (
    <section className="panel-card compact-card ai-completion-card">
      <div className="section-title">
        <h2>Completitud MVP IA</h2>
        <StatusBadge tone={toneForPercent(percent)}>{percent}%</StatusBadge>
      </div>
      <p className="muted compact-copy">
        Vista consolidada de avance técnico: readiness, reportes persistidos, roadmap y contrato de evaluación.
      </p>
      {message && <div className="toast info">{message}</div>}
      <dl className="info-list compact-info">
        <div><dt>Estado</dt><dd>{String(state.completion?.status ?? "consultando")}</dd></div>
        <div><dt>Modo actual</dt><dd>{String(state.roadmap?.currentMode ?? "contract")}</dd></div>
        <div><dt>Reportes recientes</dt><dd>{reportCount}</dd></div>
        <div><dt>Métricas definidas</dt><dd>{metrics.length || "sin datos"}</dd></div>
      </dl>
      <div className="comparison-table unified-results-table ai-completion-table">
        <div className="comparison-head"><span>Completado</span><span>Pendiente</span></div>
        <div className="comparison-row compact-comparison-row">
          <span>{completed.length ? completed.join(", ") : "sin datos"}</span>
          <span>{pending.length ? pending.join(", ") : "sin datos"}</span>
        </div>
      </div>
      <div className="comparison-table unified-results-table ai-completion-table">
        <div className="comparison-head"><span>Criterios de aceptación</span><span>Evidencia requerida</span></div>
        <div className="comparison-row compact-comparison-row">
          <span>{criteria.length ? criteria.join(", ") : "sin datos"}</span>
          <span>{requiredEvidence.length ? requiredEvidence.join(", ") : "sin datos"}</span>
        </div>
      </div>
      <div className="comparison-table unified-results-table ai-completion-table">
        <div className="comparison-head"><span>Métricas</span><span>Reportes</span></div>
        <div className="comparison-row compact-comparison-row">
          <span>{metrics.length ? metrics.join(", ") : "sin datos"}</span>
          <span>{reportCount ? `${reportCount} reporte(s) persistido(s)` : "sin reportes"}</span>
        </div>
      </div>
      <div className="diagnostics-actions">
        <button className="ghost-button" disabled={loading} onClick={() => void refresh()} type="button">Actualizar completitud</button>
      </div>
    </section>
  );
}
