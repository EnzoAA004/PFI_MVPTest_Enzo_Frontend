import type { ViewKey } from "../appTypes";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

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
  onRunDemo: () => void;
  loading: boolean;
  userName?: string;
  onLogout?: () => void;
  reviewQueueCount: number;
}

export function AppShell({ activeView, activeNavView, onChangeView, children, aiModuleAvailable, degradedMode, currentRunId, onRunDemo, loading, userName, onLogout, reviewQueueCount }: AppShellProps) {
  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} activeNavView={activeNavView} onChangeView={onChangeView} reviewQueueCount={reviewQueueCount} systemOnline={aiModuleAvailable && !degradedMode} />
      <main className="main-panel">
        <Header activeView={activeView} onChangeView={onChangeView} currentRunId={currentRunId} onRunDemo={onRunDemo} loading={loading} userName={userName} onLogout={onLogout} />
        {children}
      </main>
    </div>
  );
}
