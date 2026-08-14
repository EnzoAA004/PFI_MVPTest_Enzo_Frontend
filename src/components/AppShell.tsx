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
}

export function AppShell({ activeView, activeNavView, onChangeView, children, aiModuleAvailable, degradedMode, currentRunId, userName, onLogout, reviewQueueCount }: AppShellProps) {
  // Collapsing the rail is a workspace preference, so it survives reloads.
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(RAIL_STORAGE_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { window.localStorage.setItem(RAIL_STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* storage disabled */ }
  }, [collapsed]);

  /*
   * El tema oscuro de la superficie operativa se declara en <body> (ver
   * index.html), no acá: así lo toman también el fondo del documento y el
   * acceso, que vive fuera de este marco.
   *
   * La identidad del revisor vive al pie de la barra de navegación, no en una
   * barra propia sobre el contenido: ocupaba ~76 px de alto en cada pantalla
   * para mostrar un nombre, y quién firma la revisión es parte del marco, no
   * del contenido de la lista.
   */
  return (
    <div className={`app-layout${collapsed ? " is-rail" : ""}`}>
      <Sidebar
        activeView={activeView}
        activeNavView={activeNavView}
        onChangeView={onChangeView}
        reviewQueueCount={reviewQueueCount}
        systemOnline={aiModuleAvailable && !degradedMode}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        identity={<Header activeView={activeView} onChangeView={onChangeView} currentRunId={currentRunId} userName={userName} onLogout={onLogout} />}
      />
      <main className="main-panel">
        {children}
      </main>
    </div>
  );
}
