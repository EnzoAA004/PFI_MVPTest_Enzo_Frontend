import { useEffect, useState, type ReactNode } from "react";
import { getSystemDiagnostics, warmupSystem } from "../api";
import type { AiArtifactSummary, AiModelDiagnostic, AiModelsDiagnostics, DiagnosticBlock, SystemDiagnostics } from "../appTypes";
import { StatusBadge } from "./StatusBadge";

function toneFor(block?: DiagnosticBlock, rootStatus?: string) {
  if (block?.available === false || block?.connected === false || rootStatus === "degraded") return "amber";
  if (block?.status === "ok" || block?.available || block?.connected || block?.enabled) return "green";
  return "blue";
}

function blockStatus(block?: DiagnosticBlock) {
  if (!block) return "sin datos";
  if (block.available === false || block.connected === false) return "degradado";
  if (block.connected || block.available || block.enabled) return "ok";
  return block.status ?? block.mode ?? "info";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function artifactSummary(aiModule?: DiagnosticBlock): AiArtifactSummary | undefined {
  const direct = asRecord(aiModule?.artifactSummary);
  if (direct) return direct as AiArtifactSummary;
  const response = asRecord(aiModule?.response);
  const responseSummary = asRecord(response?.artifactSummary);
  if (responseSummary) return responseSummary as AiArtifactSummary;
  const models = asRecord(aiModule?.models);
  const modelsSummary = asRecord(models?.summary);
  return modelsSummary as AiArtifactSummary | undefined;
}

function modelsDiagnostics(aiModule?: DiagnosticBlock): AiModelsDiagnostics | undefined {
  const models = asRecord(aiModule?.models);
  return models as AiModelsDiagnostics | undefined;
}

function boolText(value?: boolean) {
  if (value === undefined) return "sin datos";
  return value ? "sí" : "no";
}

function readinessLabel(value?: string) {
  if (value === "real_artifact_available") return "artifact real disponible";
  if (value === "contract_only_missing_artifact") return "modo contrato: falta artifact";
  return value ?? "sin datos";
}

function readinessTone(model?: AiModelDiagnostic) {
  if (model?.availableForRealInference) return "green";
  if (model?.readiness === "contract_only_missing_artifact") return "amber";
  return "blue";
}

function modelEntries(models?: AiModelsDiagnostics): [string, AiModelDiagnostic][] {
  if (!models?.models) return [];
  return Object.entries(models.models).map(([key, value]) => [key, value]);
}

function DiagnosticCard({ title, block, children }: { title: string; block?: DiagnosticBlock; children?: ReactNode }) {
  return (
    <article className="panel-card compact-card diagnostic-card">
      <div className="section-title">
        <h2>{title}</h2>
        <StatusBadge tone={toneFor(block)}>{blockStatus(block)}</StatusBadge>
      </div>
      <dl className="info-list compact-info">
        {block?.service && <div><dt>Service</dt><dd>{block.service}</dd></div>}
        {block?.mode && <div><dt>Mode</dt><dd>{block.mode}</dd></div>}
        {block?.defaultInferenceMode && <div><dt>Default inference</dt><dd>{block.defaultInferenceMode}</dd></div>}
        {typeof block?.enabled === "boolean" && <div><dt>Enabled</dt><dd>{block.enabled ? "true" : "false"}</dd></div>}
        {typeof block?.available === "boolean" && <div><dt>Available</dt><dd>{block.available ? "true" : "false"}</dd></div>}
        {typeof block?.connected === "boolean" && <div><dt>Connected</dt><dd>{block.connected ? "true" : "false"}</dd></div>}
        {block?.message && <div><dt>Message</dt><dd>{block.message}</dd></div>}
      </dl>
      {children}
    </article>
  );
}

function AiArtifactReadiness({ diagnostics }: { diagnostics: SystemDiagnostics | null }) {
  const aiModule = diagnostics?.aiModule;
  const summary = artifactSummary(aiModule);
  const models = modelsDiagnostics(aiModule);
  const entries = modelEntries(models);
  const defaultMode = summary?.defaultInferenceMode ?? aiModule?.defaultInferenceMode ?? "contract";
  return (
    <section className="panel-card compact-card ai-artifact-readiness">
      <div className="section-title">
        <h2>AI Module readiness</h2>
        <StatusBadge tone={summary?.readyForRealInference ? "green" : "amber"}>{summary?.readyForRealInference ? "real listo" : "contract mode"}</StatusBadge>
      </div>
      <p className="muted compact-copy">
        Diagnóstico liviano de artifacts .pt. No carga modelos pesados; solo informa si el MVP puede operar en modo contrato o si ya tiene artifacts disponibles para inferencia real.
      </p>
      <dl className="info-list compact-info">
        <div><dt>Modo por defecto</dt><dd>{defaultMode}</dd></div>
        <div><dt>Modelos registrados</dt><dd>{summary?.modelsRegistered ?? entries.length ?? "sin datos"}</dd></div>
        <div><dt>Artifacts disponibles</dt><dd>{summary?.artifactsAvailable ?? "sin datos"}</dd></div>
        <div><dt>Artifacts faltantes</dt><dd>{summary?.artifactsMissing ?? "sin datos"}</dd></div>
        <div><dt>Real inference ready</dt><dd>{boolText(summary?.readyForRealInference)}</dd></div>
      </dl>
      {entries.length > 0 ? (
        <div className="comparison-table unified-results-table ai-artifact-table">
          <div className="comparison-head"><span>Modelo</span><span>Artifact</span><span>Readiness</span><span>Modo real</span><span>Tamaño</span></div>
          {entries.map(([key, model]) => (
            <div className="comparison-row compact-comparison-row" key={key}>
              <span><strong>{key}</strong><small>{String(model.plane ?? "plane n/d")} · {String(model.version ?? "contract-v1")}</small></span>
              <span>{model.artifact?.exists ? "presente" : "faltante"}</span>
              <span><StatusBadge tone={readinessTone(model)}>{readinessLabel(model.readiness)}</StatusBadge></span>
              <span>{boolText(model.availableForRealInference)}</span>
              <span>{model.artifact?.sizeMb ? `${model.artifact.sizeMb} MB` : "—"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-hidden-placeholder">Sin detalle de modelos. Verificá que el backend pueda consultar /models del AI Module.</div>
      )}
    </section>
  );
}

export function SystemDiagnosticsView() {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    setMessage("");
    try {
      const response = await getSystemDiagnostics();
      setDiagnostics(response);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo consultar diagnostico");
    } finally {
      setLoading(false);
    }
  }

  async function warmup() {
    setLoading(true);
    setMessage("");
    try {
      await warmupSystem();
      setMessage("Warmup enviado al AI Module. Actualizando diagnostico...");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo ejecutar warmup");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <div className="view-stack clinical-quiet diagnostics-view">
      <section className="page-heading compact-heading">
        <div>
          <p>System Settings</p>
          <h1>System Diagnostics</h1>
        </div>
        <div className="safety-copy">
          <strong>Estado tecnico del MVP</strong>
          <span>Frontend conectado a backend, AI Module y Postgres.</span>
        </div>
      </section>

      {message && <div className="toast info">{message}</div>}

      <section className="panel-card compact-card diagnostics-summary">
        <div className="section-title">
          <h2>Resumen operativo</h2>
          <StatusBadge tone={diagnostics?.status === "ok" ? "green" : "amber"}>{diagnostics?.status ?? "consultando"}</StatusBadge>
        </div>
        <div className="diagnostics-actions">
          <button className="primary-button" disabled={loading} onClick={() => void refresh()} type="button">Actualizar diagnóstico</button>
          <button className="ghost-button" disabled={loading} onClick={() => void warmup()} type="button">Warmup AI Module</button>
          <span className="muted">Último control: {diagnostics?.checkedAt ? new Date(diagnostics.checkedAt).toLocaleString() : "pendiente"}</span>
        </div>
      </section>

      <section className="diagnostics-grid">
        <DiagnosticCard title="Backend" block={diagnostics?.backend} />
        <DiagnosticCard title="AI Module" block={diagnostics?.aiModule} />
        <DiagnosticCard title="PostgreSQL" block={diagnostics?.database} />
        <DiagnosticCard title="Auth" block={diagnostics?.auth} />
      </section>

      <AiArtifactReadiness diagnostics={diagnostics} />

      <section className="panel-card compact-card">
        <div className="section-title"><h2>Condiciones de seguridad del MVP</h2></div>
        <ul className="check-list">
          <li>Revisión profesional requerida: {diagnostics?.humanReviewRequired === false ? "no" : "sí"}</li>
          <li>No constituye diagnóstico clínico: {diagnostics?.notClinicalDiagnosis === false ? "no" : "sí"}</li>
          <li>Persistencia activa: {String(diagnostics?.persistence?.mode ?? "sin datos")}</li>
          <li>Postgres habilitado: {diagnostics?.persistence?.postgresEnabled ? "sí" : "no"}</li>
        </ul>
      </section>
    </div>
  );
}
