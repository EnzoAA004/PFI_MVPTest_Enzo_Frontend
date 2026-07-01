import { API_BASE_URL } from "../api";
import { StatusBadge } from "./StatusBadge";

interface HeaderProps {
  health: string;
  modelCount: number;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  onRunDemo: () => void;
  loading: boolean;
}

export function Header({ health, modelCount, aiModuleAvailable, degradedMode, onRunDemo, loading }: HeaderProps) {
  const backendTone = degradedMode ? "amber" : aiModuleAvailable ? "green" : "red";
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
        <small title={API_BASE_URL}>Reviewer</small>
        <button className="primary-button" disabled={loading} onClick={onRunDemo} type="button">
          {loading ? "Ejecutando..." : "Ejecutar caso demo"}
        </button>
      </div>
    </header>
  );
}
