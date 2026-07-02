import { useEffect, useState } from "react";
import { getSystemDiagnostics, warmupSystem } from "../api";
import type { DiagnosticBlock, SystemDiagnostics } from "../appTypes";
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

function DiagnosticCard({ title, block, children }: { title: string; block?: DiagnosticBlock; children?: any }) {
  return (
    <article className="panel-card compact-card diagnostic-card">
      <div className="section-title">
        <h2>{title}</h2>
        <StatusBadge tone={toneFor(block)}>{blockStatus(block)}</StatusBadge>
      </div>
      <dl className="info-list compact-info">
        {block?.service && <div><dt>Service</dt><dd>{block.service}</dd></div>}
        {block?.mode && <div><dt>Mode</dt><dd>{block.mode}</dd></div>}
        {typeof block?.enabled === "boolean" && <div><dt>Enabled</dt><dd>{block.enabled ? "true" : "false"}</dd></div>}
        {typeof block?.available === "boolean" && <div><dt>Available</dt><dd>{block.available ? "true" : "false"}</dd></div>}
        {typeof block?.connected === "boolean" && <div><dt>Connected</dt><dd>{block.connected ? "true" : "false"}</dd></div>}
        {block?.message && <div><dt>Message</dt><dd>{block.message}</dd></div>}
      </dl>
      {children}
    </article>
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

      <section className="panel-card compact-card">
        <div className="section-title"><h2>Condiciones de seguridad del MVP</h2></div>
        <ul className="check-list">
          <li>Revisión profesional requerida: {diagnostics?.humanReviewRequired === false ? "no" : "sí"}</li>
          <li>No constituye diagnóstico clínico: {diagnostics?.notClinicalDiagnosis === false ? "no" : "sí"}</li>
          <li>Persistencia activa: {diagnostics?.persistence?.mode ?? "sin datos"}</li>
          <li>Postgres habilitado: {diagnostics?.persistence?.postgresEnabled ? "sí" : "no"}</li>
        </ul>
      </section>
    </div>
  );
}
