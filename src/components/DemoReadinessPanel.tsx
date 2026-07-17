import { useEffect, useMemo, useState } from "react";
import { BackendApiError, getAiHealthStatus, getAiModelsStatus, getAiReadinessStatus, getAiRuntimeStatus, getSystemDiagnosticsStatus, syncRealModelArtifacts, verifyAiModelsStatus } from "../multiplanarApi";
import type { DiagnosticEndpointName, DiagnosticEndpointResponse, DiagnosticEndpointResult } from "../multiplanarRunTypes";
import { StatusBadge } from "./StatusBadge";

type EndpointConfig = {
  name: DiagnosticEndpointName;
  label: string;
  endpoint: string;
  method: "GET" | "POST";
  load?: () => Promise<DiagnosticEndpointResponse>;
};

const endpointConfigs: EndpointConfig[] = [
  { name: "health", label: "Health", endpoint: "/api/ai/health", method: "GET", load: getAiHealthStatus },
  { name: "readiness", label: "Readiness", endpoint: "/api/ai/readiness", method: "GET", load: getAiReadinessStatus },
  { name: "models", label: "Models", endpoint: "/api/ai/models", method: "GET", load: getAiModelsStatus },
  { name: "modelsVerify", label: "Models verify", endpoint: "/api/ai/models/verify", method: "GET", load: verifyAiModelsStatus },
  { name: "runtime", label: "Runtime", endpoint: "/api/ai/models/runtime", method: "GET", load: getAiRuntimeStatus },
  { name: "systemDiagnostics", label: "System diagnostics", endpoint: "/api/system/diagnostics", method: "GET", load: getSystemDiagnosticsStatus },
  { name: "sync", label: "Sync", endpoint: "/api/ai/models/sync?force=false", method: "POST" },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function endpointError(error: unknown) {
  if (error instanceof BackendApiError) return `HTTP ${error.status} en ${error.path}`;
  if (error instanceof Error) return error.message;
  return "Endpoint no disponible";
}

function statusText(response?: DiagnosticEndpointResponse, error?: string) {
  if (error) return "no disponible";
  return String(response?.status ?? response?.service ?? "ok");
}

function statusTone(result: DiagnosticEndpointResult): "green" | "amber" | "red" | "blue" {
  if (!result.available) return result.error ? "red" : "amber";
  const status = String(result.response?.status ?? "").toLowerCase();
  if (status.includes("unavailable") || status.includes("failed") || status.includes("down")) return "red";
  if (status.includes("contract") || status.includes("fallback") || result.response?.readyForRealInference === false) return "amber";
  if (status.includes("ok") || status.includes("ready") || result.response?.readyForRealInference === true) return "green";
  return "blue";
}

function boolText(value: unknown) {
  if (typeof value !== "boolean") return "sin datos";
  return value ? "sí" : "no";
}

function readSummaryValue(response: DiagnosticEndpointResponse | undefined, key: string): unknown {
  const direct = response?.[key];
  if (direct !== undefined) return direct;
  const summary = asRecord(asRecord(response?.models).summary);
  if (summary[key] !== undefined) return summary[key];
  const artifactSummary = asRecord(response?.artifactSummary);
  if (artifactSummary[key] !== undefined) return artifactSummary[key];
  const aiModule = asRecord(response?.aiModule);
  if (aiModule[key] !== undefined) return aiModule[key];
  const readiness = asRecord(response?.readiness);
  return readiness[key];
}

function modelRows(modelsResponse?: DiagnosticEndpointResponse): Array<Record<string, unknown> & { key: string }> {
  if (!modelsResponse) return [];
  if (Array.isArray(modelsResponse)) {
    return modelsResponse.map((item, index) => ({ ...asRecord(item), key: String(asRecord(item).key ?? `model-${index + 1}`) }));
  }
  const models = asRecord(modelsResponse.models);
  if (models.models && typeof models.models === "object") {
    return Object.entries(asRecord(models.models)).map(([key, value]) => ({ ...asRecord(value), key }));
  }
  if (Object.keys(models).length > 0) {
    return Object.entries(models).map(([key, value]) => ({ ...asRecord(value), key }));
  }
  return [];
}

function modeBadgeTone(value: unknown): "green" | "amber" | "blue" {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("real")) return "green";
  if (text.includes("contract") || text.includes("fallback") || text.includes("missing")) return "amber";
  return "blue";
}

export function DemoReadinessPanel() {
  const [results, setResults] = useState<DiagnosticEndpointResult[]>(() => endpointConfigs.map(({ name, endpoint, method }) => ({ name, endpoint, method, available: false })));
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    setMessage("");
    const loaded = await Promise.all(endpointConfigs.map(async (config): Promise<DiagnosticEndpointResult> => {
      if (!config.load) return { name: config.name, endpoint: config.endpoint, method: config.method, available: false, error: "Sin endpoint GET de estado; acción POST disponible." };
      try {
        const response = await config.load();
        return { name: config.name, endpoint: config.endpoint, method: config.method, available: true, response };
      } catch (error) {
        return { name: config.name, endpoint: config.endpoint, method: config.method, available: false, error: endpointError(error) };
      }
    }));
    setResults(loaded);
    setLoading(false);
  }

  async function runSync() {
    setSyncing(true);
    setMessage("Ejecutando sync de modelos...");
    try {
      const response = await syncRealModelArtifacts(false);
      setResults((current) => current.map((result) => result.name === "sync" ? {
        name: "sync",
        endpoint: "/api/ai/models/sync?force=false",
        method: "POST",
        available: true,
        response,
      } : result));
      setMessage("Sync consultado desde backend.");
    } catch (error) {
      setResults((current) => current.map((result) => result.name === "sync" ? {
        name: "sync",
        endpoint: "/api/ai/models/sync?force=false",
        method: "POST",
        available: false,
        error: endpointError(error),
      } : result));
      setMessage(endpointError(error));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const resultByName = useMemo(() => Object.fromEntries(results.map((result) => [result.name, result])), [results]);
  const readiness = resultByName.readiness?.response;
  const runtime = resultByName.runtime?.response;
  const models = modelRows(resultByName.models?.response);
  const defaultMode = readSummaryValue(readiness, "defaultInferenceMode") ?? readSummaryValue(resultByName.systemDiagnostics?.response, "defaultInferenceMode") ?? "sin datos";
  const realReady = readSummaryValue(readiness, "readyForRealInference");

  return (
    <section className="panel-card compact-card">
      <div className="section-title">
        <div>
          <h2>Readiness demo</h2>
          <p className="muted compact-copy">Estados consultados al backend/AI Module. No usa fallback mock silencioso.</p>
        </div>
        <StatusBadge tone={realReady === true ? "green" : "amber"}>{realReady === true ? "real_baseline" : "contract/fallback visible"}</StatusBadge>
      </div>
      {message && <div className="toast info">{message}</div>}
      <div className="diagnostics-actions">
        <button className="primary-button" disabled={loading || syncing} onClick={() => void refresh()} type="button">{loading ? "Consultando..." : "Actualizar readiness"}</button>
        <button className="ghost-button" disabled={loading || syncing} onClick={() => void runSync()} type="button">{syncing ? "Sincronizando..." : "Consultar sync"}</button>
        <span className="muted">Sync es POST; no se ejecuta automáticamente.</span>
      </div>
      <dl className="info-list compact-info">
        <div><dt>Modo por defecto</dt><dd>{String(defaultMode)}</dd></div>
        <div><dt>Ready for demo</dt><dd>{String(readSummaryValue(readiness, "readyForDemo") ?? "sin datos")}</dd></div>
        <div><dt>Ready real baseline</dt><dd>{boolText(realReady)}</dd></div>
        <div><dt>Runtime</dt><dd>{String(runtime?.status ?? "sin datos")}</dd></div>
      </dl>
      <div className="comparison-table unified-results-table ai-completion-table">
        <div className="comparison-head"><span>Endpoint</span><span>Estado</span><span>Detalle</span></div>
        {endpointConfigs.map((config) => {
          const result = results.find((item) => item.name === config.name);
          return (
            <div className="comparison-row compact-comparison-row" key={config.name}>
              <span><strong>{config.label}</strong><small>{config.method} {config.endpoint}</small></span>
              <span><StatusBadge tone={result ? statusTone(result) : "blue"}>{statusText(result?.response, result?.error)}</StatusBadge></span>
              <span>{result?.error ?? String(result?.response?.message ?? result?.response?.defaultInferenceMode ?? result?.response?.service ?? "respuesta recibida")}</span>
            </div>
          );
        })}
      </div>
      <div className="comparison-table unified-results-table ai-completion-table">
        <div className="comparison-head"><span>Modelo</span><span>Modo/readiness</span><span>Runtime</span></div>
        {models.length ? models.map((model) => {
          const readinessValue = model.readiness ?? model.status ?? model.mode ?? defaultMode;
          return (
            <div className="comparison-row compact-comparison-row" key={model.key}>
              <span><strong>{model.key}</strong><small>{String(model.plane ?? "plane n/d")} · {String(model.version ?? "version n/d")}</small></span>
              <span><StatusBadge tone={modeBadgeTone(readinessValue)}>{String(readinessValue)}</StatusBadge></span>
              <span>{String(model.availableForRealInference ?? model.enabled ?? model.exists ?? "sin datos")}</span>
            </div>
          );
        }) : <div className="comparison-row compact-comparison-row"><span>Modelos</span><span>sin datos</span><span>GET /api/ai/models no devolvió lista interpretable.</span></div>}
      </div>
    </section>
  );
}
