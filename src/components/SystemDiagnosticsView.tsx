import { useEffect, useState, type ReactNode } from "react";
import { getSystemDiagnostics, warmupSystem } from "../api";
import { getCurrentDoctor, listProfessionals, updateDoctorSettings, updateProfessionalApproval } from "../authClient";
import type { AiArtifactSummary, AiModelDiagnostic, AiModelsDiagnostics, AuthUser, DiagnosticBlock, SystemDiagnostics } from "../appTypes";
import { PipelineContractCard } from "./PipelineContractCard";
import { StatusBadge } from "./StatusBadge";
import { ToggleSwitch } from "./ToggleSwitch";

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
      <div className="section-title"><h2>{title}</h2><StatusBadge tone={toneFor(block)}>{blockStatus(block)}</StatusBadge></div>
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
      <div className="section-title"><h2>AI Module readiness</h2><StatusBadge tone={summary?.readyForRealInference ? "green" : "amber"}>{summary?.readyForRealInference ? "real listo" : "contract mode"}</StatusBadge></div>
      <p className="muted compact-copy">Diagnóstico liviano de artifacts .pt. No carga modelos pesados; solo informa si el MVP puede operar en modo contrato o si ya tiene artifacts disponibles para inferencia real.</p>
      <dl className="info-list compact-info">
        <div><dt>Modo por defecto</dt><dd>{defaultMode}</dd></div>
        <div><dt>Modelos registrados</dt><dd>{summary?.modelsRegistered ?? entries.length ?? "sin datos"}</dd></div>
        <div><dt>Artifacts disponibles</dt><dd>{summary?.artifactsAvailable ?? "sin datos"}</dd></div>
        <div><dt>Artifacts faltantes</dt><dd>{summary?.artifactsMissing ?? "sin datos"}</dd></div>
        <div><dt>Real inference ready</dt><dd>{boolText(summary?.readyForRealInference)}</dd></div>
      </dl>
      {entries.length > 0 ? <div className="comparison-table unified-results-table ai-artifact-table"><div className="comparison-head"><span>Modelo</span><span>Artifact</span><span>Readiness</span><span>Modo real</span><span>Tamaño</span></div>{entries.map(([key, model]) => <div className="comparison-row compact-comparison-row" key={key}><span><strong>{key}</strong><small>{String(model.plane ?? "plane n/d")} · {String(model.version ?? "contract-v1")}</small></span><span>{model.artifact?.exists ? "presente" : "faltante"}</span><span><StatusBadge tone={readinessTone(model)}>{readinessLabel(model.readiness)}</StatusBadge></span><span>{boolText(model.availableForRealInference)}</span><span>{model.artifact?.sizeMb ? `${model.artifact.sizeMb} MB` : "—"}</span></div>)}</div> : <div className="panel-hidden-placeholder">Sin detalle de modelos. Verificá que el backend pueda consultar /models del AI Module.</div>}
    </section>
  );
}

function approvalTone(user: AuthUser) {
  if (!user.verified) return "amber";
  if (user.approved === false || user.roles.includes("PENDING_APPROVAL")) return "amber";
  return "green";
}

function isPending(user: AuthUser) {
  return user.approved === false || user.roles.includes("PENDING_APPROVAL");
}

export function SystemDiagnosticsView() {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [doctor, setDoctor] = useState<AuthUser | null>(null);
  const [professionals, setProfessionals] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin = Boolean(doctor?.roles?.includes("ADMIN"));

  async function refresh() {
    setLoading(true);
    setMessage("");
    try {
      const [diagnosticsResponse, currentUser] = await Promise.all([getSystemDiagnostics(), getCurrentDoctor().catch(() => null)]);
      setDiagnostics(diagnosticsResponse);
      setDoctor(currentUser);
      if (currentUser?.roles?.includes("ADMIN")) {
        setProfessionals(await listProfessionals().catch(() => []));
      } else {
        setProfessionals([]);
      }
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

  async function toggleTwoFactor() {
    if (!doctor) return;
    setLoading(true);
    try {
      const updated = await updateDoctorSettings({ twoFactorEnabled: !doctor.twoFactorEnabled });
      setDoctor(updated);
      setMessage(updated.twoFactorEnabled ? "Doble verificación habilitada para el próximo login." : "Doble verificación deshabilitada para el próximo login.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar seguridad");
    } finally {
      setLoading(false);
    }
  }

  async function setApproval(user: AuthUser, approved: boolean) {
    setLoading(true);
    try {
      const updated = await updateProfessionalApproval(user.email, approved);
      setProfessionals((current) => current.map((item) => item.email === updated.email ? updated : item));
      setMessage(`${updated.fullName} actualizado: ${updated.approved ? "aprobado" : "pendiente"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar aprobacion");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <div className="view-stack clinical-quiet diagnostics-view">
      <section className="page-heading compact-heading"><div><p>System Settings</p><h1>System Diagnostics</h1></div><div className="safety-copy"><strong>Estado tecnico del MVP</strong><span>Frontend conectado a backend, AI Module y Postgres.</span></div></section>
      {message && <div className="toast info">{message}</div>}
      <section className="panel-card compact-card diagnostics-summary"><div className="section-title"><h2>Resumen operativo</h2><StatusBadge tone={diagnostics?.status === "ok" ? "green" : "amber"}>{diagnostics?.status ?? "consultando"}</StatusBadge></div><div className="diagnostics-actions"><button className="primary-button" disabled={loading} onClick={() => void refresh()} type="button">Actualizar diagnóstico</button><button className="ghost-button" disabled={loading} onClick={() => void warmup()} type="button">Warmup AI Module</button><span className="muted">Último control: {diagnostics?.checkedAt ? new Date(diagnostics.checkedAt).toLocaleString() : "pendiente"}</span></div></section>
      <section className="diagnostics-grid"><DiagnosticCard title="Backend" block={diagnostics?.backend} /><DiagnosticCard title="AI Module" block={diagnostics?.aiModule} /><DiagnosticCard title="PostgreSQL" block={diagnostics?.database} /><DiagnosticCard title="Auth" block={diagnostics?.auth} /></section>

      <section className="panel-card compact-card security-settings-card">
        <div className="section-title"><h2>Configuración de seguridad profesional</h2><StatusBadge tone={doctor?.twoFactorEnabled ? "green" : "blue"}>{doctor?.twoFactorEnabled ? "2FA activo" : "2FA opcional"}</StatusBadge></div>
        <p className="muted compact-copy">La doble verificación no se fuerza por defecto. Cada profesional puede habilitarla o deshabilitarla desde esta pantalla.</p>
        <dl className="info-list compact-info"><div><dt>Profesional</dt><dd>{doctor?.fullName ?? "sin datos"}</dd></div><div><dt>Email</dt><dd>{doctor?.email ?? "sin datos"}</dd></div><div><dt>Cuenta aprobada</dt><dd>{doctor?.approved === false ? "no" : "sí"}</dd></div><div><dt>Onboarding</dt><dd>{doctor?.onboardingCompleted ? "completo" : "pendiente"}</dd></div></dl>
        <ToggleSwitch checked={Boolean(doctor?.twoFactorEnabled)} disabled={loading || !doctor} label="Doble verificación" description="Requerir un código adicional al iniciar sesión. El cambio se aplica en el próximo login." onChange={() => void toggleTwoFactor()} />
      </section>

      {isAdmin && <section className="panel-card compact-card professional-admin-card"><div className="section-title"><h2>Aprobación de profesionales</h2><StatusBadge tone="blue">admin</StatusBadge></div><p className="muted compact-copy">Los profesionales nuevos quedan con acceso limitado hasta ser aprobados por un administrador.</p><div className="comparison-table unified-results-table professional-table"><div className="comparison-head"><span>Profesional</span><span>Email</span><span>Estado</span><span>Roles</span><span>Aprobación</span></div>{professionals.map((user) => <div className="comparison-row compact-comparison-row" key={user.email}><span><strong>{user.fullName}</strong><small>{user.licenseNumber || "sin matrícula"} · {user.specialty || "sin especialidad"}</small></span><span>{user.email}</span><span><StatusBadge tone={approvalTone(user)}>{isPending(user) ? "pendiente" : "aprobado"}</StatusBadge></span><span>{user.roles.join(", ")}</span><span><button type="button" role="switch" aria-checked={!isPending(user)} aria-label={`Aprobación ${user.fullName}`} className={!isPending(user) ? "ios-switch is-on compact-switch" : "ios-switch is-off compact-switch"} disabled={loading || user.roles.includes("ADMIN")} onClick={() => void setApproval(user, isPending(user))}><span className="ios-switch-thumb" /></button></span></div>)}</div></section>}

      <AiArtifactReadiness diagnostics={diagnostics} />
      <PipelineContractCard />
      <section className="panel-card compact-card"><div className="section-title"><h2>Condiciones de seguridad del MVP</h2></div><ul className="check-list"><li>Revisión profesional requerida: {diagnostics?.humanReviewRequired === false ? "no" : "sí"}</li><li>No constituye diagnóstico clínico: {diagnostics?.notClinicalDiagnosis === false ? "no" : "sí"}</li><li>Persistencia activa: {String(diagnostics?.persistence?.mode ?? "sin datos")}</li><li>Postgres habilitado: {diagnostics?.persistence?.postgresEnabled ? "sí" : "no"}</li></ul></section>
    </div>
  );
}
