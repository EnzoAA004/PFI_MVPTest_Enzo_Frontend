import type { ReactNode } from "react";
import type { ViewKey } from "../types";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  activeView: ViewKey;
  onChangeView: (view: ViewKey) => void;
  children: ReactNode;
  health: string;
  modelCount: number;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  onRunDemo: () => void;
  loading: boolean;
}

export function AppShell({
  activeView,
  onChangeView,
  children,
  health,
  modelCount,
  aiModuleAvailable,
  degradedMode,
  onRunDemo,
  loading,
}: AppShellProps) {
  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} onChangeView={onChangeView} />
      <main className="main-panel">
        <Header
          health={health}
          modelCount={modelCount}
          aiModuleAvailable={aiModuleAvailable}
          degradedMode={degradedMode}
          onRunDemo={onRunDemo}
          loading={loading}
        />
        {children}
      </main>
    </div>
  );
}
