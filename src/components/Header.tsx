import { API_BASE_URL } from "../api";
import { authHeaders } from "../authClient";
import type { ViewKey } from "../appTypes";
import { StatusBadge } from "./StatusBadge";

interface HeaderProps {
  activeView: ViewKey;
  health: string;
  modelCount: number;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  currentRunId?: string;
  onRunDemo: () => void;
  loading: boolean;
  userName?: string;
  onLogout?: () => void;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function boolText(value: unknown) {
  if (value === true) return "sí";
  if (value === false) return "no";
  return "sin datos";
}

function renderTechnicalReportHtml(payload: any) {
  const quality = asRecord(payload.quality);
  const aiOutput = asRecord(payload.aiOutput);
  const artifact = asRecord(asRecord(payload.modelArtifact).artifact ?? asRecord(payload.metadata).modelArtifact);
  const review = asRecord(payload.review);
  const measurements = Array.isArray(payload.measurementValues)
    ? payload.measurementValues
    : Array.isArray(asRecord(payload.measurements).values)
      ? asRecord(payload.measurements).values
      : [];
  const json = JSON.stringify(payload, null, 2);
  const rows = measurements.map((item: any) => `
    <tr>
      <td><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.level)}</span></td>
      <td>${escapeHtml(item.aiValue ?? item.value)} ${escapeHtml(item.unit)}</td>
      <td>${escapeHtml(item.reviewerValue ?? "sin cambios")}</td>
      <td>${escapeHtml(Math.round((Number(item.confidence) || 0) * 100))}%</td>
      <td>${escapeHtml(item.status)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte técnico ${escapeHtml(payload.runId)}</title>
  <style>
    :root{color-scheme:light;--ink:#102033;--muted:#60738a;--line:#d8e6f4;--soft:#f8fbff;--blue:#2563eb;--green:#16a34a;--amber:#b7791f}
    body{font-family:Inter,Segoe UI,Arial,sans-serif;background:#eef4fb;margin:0;color:var(--ink);padding:32px}
    main{max-width:1120px;margin:auto;background:#fff;border:1px solid rgba(148,163,184,.24);border-radius:24px;box-shadow:0 24px 70px rgba(15,23,42,.14);padding:30px}
    .eyebrow{text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-size:12px;font-weight:900}
    h1{margin:6px 0 6px;font-size:30px;letter-spacing:-.03em}.subtitle{color:var(--muted);margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0}.card{border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,#fff,var(--soft));padding:14px;box-shadow:0 8px 20px rgba(15,23,42,.05)}.card span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;font-weight:900}.card strong{display:block;margin-top:6px;font-size:20px}.notice{border:1px solid #bae6fd;background:#f0f9ff;border-radius:16px;padding:14px;margin:18px 0;color:#0f3b57}.section{margin-top:24px}h2{font-size:18px;margin:0 0 12px}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fact{display:grid;grid-template-columns:150px 1fr;gap:10px;border-bottom:1px solid #edf3f8;padding:8px 0}.fact dt{color:var(--muted);font-size:12px;text-transform:uppercase;font-weight:900}.fact dd{margin:0;font-weight:700;word-break:break-word}table{width:100%;border-collapse:collapse;border:1px solid var(--line);border-radius:14px;overflow:hidden}th{background:#eef4fb;text-align:left;font-size:12px;text-transform:uppercase;color:#52657b}td,th{padding:12px;border-bottom:1px solid #e7eef7;vertical-align:top}td span{display:block;color:var(--muted);font-size:12px;margin-top:3px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.actions button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:9px 14px;font-weight:800;cursor:pointer}.actions button.primary{background:var(--blue);border-color:var(--blue);color:#fff}pre{white-space:pre-wrap;word-break:break-word;background:#0b1220;color:#dbeafe;border-radius:16px;padding:16px;max-height:560px;overflow:auto;font-size:12px}.footer{color:var(--muted);font-size:12px;margin-top:20px}@media print{body{background:#fff;padding:0}main{box-shadow:none;border:0}.actions{display:none}pre{max-height:none}}@media(max-width:820px){body{padding:16px}.grid,.facts{grid-template-columns:1fr}.fact{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">PFI Lumbar MRI · Reporte técnico autenticado</div>
    <h1>${escapeHtml(payload.caseId)} · ${escapeHtml(payload.runId)}</h1>
    <p class="subtitle">Salida técnica generada por el módulo IA para revisión profesional. Datos de-identificados.</p>

    <section class="grid">
      <article class="card"><span>Estado revisión</span><strong>${escapeHtml(review.status ?? payload.reviewStatus)}</strong></article>
      <article class="card"><span>Modo inferencia</span><strong>${escapeHtml(aiOutput.inferenceMode ?? asRecord(payload.metadata).inferenceMode)}</strong></article>
      <article class="card"><span>Mediciones</span><strong>${escapeHtml(quality.measurementCount ?? measurements.length)}</strong></article>
      <article class="card"><span>Modelo real</span><strong>${boolText(asRecord(payload.modelArtifact).availableForRealInference)}</strong></article>
    </section>

    <section class="notice"><strong>Alcance:</strong> requiere revisión profesional, no constituye diagnóstico clínico y no incluye imágenes crudas. El resultado se presenta como salida asistiva y trazable.</section>

    <section class="section">
      <h2>Trazabilidad</h2>
      <dl class="facts">
        <div class="fact"><dt>Caso</dt><dd>${escapeHtml(payload.caseId)}</dd></div>
        <div class="fact"><dt>Sujeto ref.</dt><dd>${escapeHtml(payload.patientId)}</dd></div>
        <div class="fact"><dt>Fecha estudio</dt><dd>${escapeHtml(payload.studyDate)}</dd></div>
        <div class="fact"><dt>Plano</dt><dd>${escapeHtml(payload.plane)}</dd></div>
        <div class="fact"><dt>Modelo</dt><dd>${escapeHtml(payload.modelKey)} · ${escapeHtml(payload.modelVersion)}</dd></div>
        <div class="fact"><dt>Readiness</dt><dd>${escapeHtml(aiOutput.modelReadiness ?? asRecord(payload.modelArtifact).readiness)}</dd></div>
        <div class="fact"><dt>Artifact</dt><dd>${escapeHtml(artifact.path)}</dd></div>
        <div class="fact"><dt>Artifact existe</dt><dd>${boolText(artifact.exists)}</dd></div>
        <div class="fact"><dt>Máscaras</dt><dd>${escapeHtml(quality.maskCount)}</dd></div>
        <div class="fact"><dt>Landmarks</dt><dd>${escapeHtml(quality.landmarkCount)}</dd></div>
        <div class="fact"><dt>Pixel spacing</dt><dd>${escapeHtml(quality.pixelSpacingMm)} mm</dd></div>
        <div class="fact"><dt>Contornos</dt><dd>${boolText(quality.measurementsDerivedFromContours)}</dd></div>
      </dl>
    </section>

    <section class="section">
      <h2>Mediciones</h2>
      <table>
        <thead><tr><th>Medición</th><th>Valor IA</th><th>Reviewer</th><th>Confianza</th><th>Estado</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5">Sin mediciones disponibles.</td></tr>`}</tbody>
      </table>
    </section>

    <section class="section">
      <h2>Revisión</h2>
      <dl class="facts">
        <div class="fact"><dt>Estado</dt><dd>${escapeHtml(review.status ?? payload.reviewStatus)}</dd></div>
        <div class="fact"><dt>Reviewer</dt><dd>${escapeHtml(review.reviewer)}</dd></div>
        <div class="fact"><dt>Actualizado</dt><dd>${escapeHtml(review.updatedAt)}</dd></div>
        <div class="fact"><dt>Notas</dt><dd>${escapeHtml(review.notes || "Sin notas registradas")}</dd></div>
      </dl>
    </section>

    <section class="section">
      <h2>JSON completo</h2>
      <pre>${escapeHtml(json)}</pre>
    </section>

    <div class="actions">
      <button class="primary" onclick="window.print()">Imprimir / guardar PDF</button>
      <button onclick="navigator.clipboard.writeText(document.querySelector('pre').innerText)">Copiar JSON</button>
    </div>
    <p class="footer">Reporte generado localmente desde la app usando fetch autenticado. El enlace blob no expone el JWT.</p>
  </main>
</body>
</html>`;
}

export function Header({ activeView, health, modelCount, aiModuleAvailable, degradedMode, currentRunId, onRunDemo, loading, userName, onLogout }: HeaderProps) {
  const backendTone = degradedMode ? "amber" : aiModuleAvailable ? "green" : "red";
  const showTechnicalReport = activeView === "review" && Boolean(currentRunId);
  const technicalReportUrl = currentRunId ? `${API_BASE_URL}/api/ai/agent/report/${currentRunId}` : "";

  async function openTechnicalReport() {
    if (!technicalReportUrl) return;
    try {
      const response = await fetch(technicalReportUrl, {
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (!response.ok) throw new Error(`Backend respondió ${response.status}`);
      const payload = await response.json();
      const html = renderTechnicalReportHtml(payload);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
      alert(error instanceof Error ? `No se pudo abrir el reporte técnico: ${error.message}` : "No se pudo abrir el reporte técnico.");
    }
  }

  return (
    <header className="top-header">
      <div className="search-box">
        <span aria-hidden="true">⌕</span>
        <input placeholder="Buscar estudios, casos o pacientes..." />
      </div>
      <div className="header-actions">
        <StatusBadge tone="teal">Academic / De-identified Data</StatusBadge>
        <StatusBadge tone={backendTone}>
          {degradedMode ? "Modo degradado" : `Backend ${health}`} / {modelCount} models
        </StatusBadge>
        <small title={API_BASE_URL}>{userName ?? "Reviewer"}</small>
        {showTechnicalReport && (
          <button className="ghost-button" onClick={() => void openTechnicalReport()} title="Abrir reporte técnico autenticado" type="button">
            Reporte técnico
          </button>
        )}
        <button className="primary-button" disabled={loading} onClick={onRunDemo} type="button">
          {loading ? "Ejecutando..." : "Ejecutar caso demo"}
        </button>
        {onLogout && <button className="ghost-button" onClick={onLogout} type="button">Salir</button>}
      </div>
    </header>
  );
}
