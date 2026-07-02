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
      const formattedJson = JSON.stringify(payload, null, 2);
      const blob = new Blob([formattedJson], { type: "application/json;charset=utf-8" });
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
