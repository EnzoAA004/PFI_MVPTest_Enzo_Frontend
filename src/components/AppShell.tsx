import type { ViewKey } from "../appTypes";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  activeView: ViewKey;
  onChangeView: (view: ViewKey) => void;
  children: any;
  health: string;
  modelCount: number;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  onRunDemo: () => void;
  loading: boolean;
  userName?: string;
  onLogout?: () => void;
}

export function AppShell({ activeView, onChangeView, children, health, modelCount, aiModuleAvailable, degradedMode, onRunDemo, loading, userName, onLogout }: AppShellProps) {
  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} onChangeView={onChangeView} />
      <main className="main-panel">
        <Header health={health} modelCount={modelCount} aiModuleAvailable={aiModuleAvailable} degradedMode={degradedMode} onRunDemo={onRunDemo} loading={loading} userName={userName} onLogout={onLogout} />
        {children}
      </main>
    </div>
  );
}
