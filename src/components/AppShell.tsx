import { useEffect, useState } from "react";
import type { ViewKey } from "../appTypes";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

const RAIL_STORAGE_KEY = "pfi.sidebar.collapsed";

interface AppShellProps {
  activeView: ViewKey;
  activeNavView?: ViewKey;
  onChangeView: (view: ViewKey) => void;
  children: any;
  health: string;
  modelCount: number;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  currentRunId?: string;
  userName?: string;
  onLogout?: () => void;
  reviewQueueCount: number;
  immersive?: boolean;
}

export function AppShell({ activeView, activeNavView, onChangeView, children, aiModuleAvailable, degradedMode, currentRunId, userName, onLogout, reviewQueueCount, immersive = false }: AppShellProps) {
  // Collapsing the rail is a workspace preference, so it survives reloads.
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(RAIL_STORAGE_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { window.localStorage.setItem(RAIL_STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* storage disabled */ }
  }, [collapsed]);

  return (
    <div className={`app-layout${collapsed ? " is-rail" : ""}${immersive ? " is-immersive" : ""}`}>
      {!immersive && (
        <Sidebar
          activeView={activeView}
          activeNavView={activeNavView}
          onChangeView={onChangeView}
          reviewQueueCount={reviewQueueCount}
          systemOnline={aiModuleAvailable && !degradedMode}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
        />
      )}
      <main className="main-panel">
        {!immersive && <Header activeView={activeView} onChangeView={onChangeView} currentRunId={currentRunId} userName={userName} onLogout={onLogout} />}
        {children}
      </main>
    </div>
  );
}
