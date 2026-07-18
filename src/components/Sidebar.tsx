import type { ViewKey } from "../appTypes";
import type { ComponentType } from "react";
import { ClipboardList, Folder, HelpCircle, History, Home, Settings, ShieldCheck, UploadCloud, Users } from "lucide-react";

const navItems: Array<{ key: ViewKey; label: string; icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; badge?: "reviewQueue" }> = [
  { key: "dashboard", label: "Dashboard", icon: Home },
  { key: "analysis", label: "Nuevo análisis", icon: UploadCloud },
  { key: "studies", label: "Studies", icon: Folder },
  { key: "queue", label: "Review Queue", icon: ClipboardList, badge: "reviewQueue" },
  { key: "patients", label: "Patients", icon: Users },
  { key: "history", label: "History", icon: History },
  { key: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  activeView: ViewKey;
  activeNavView?: ViewKey;
  onChangeView: (view: ViewKey) => void;
  reviewQueueCount: number;
  systemOnline?: boolean;
}

export function Sidebar({ activeView, activeNavView = activeView, onChangeView, reviewQueueCount, systemOnline = true }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img" aria-label="Lumbar spine mark">
            <path d="M12 3c-1.4 0-2.5.8-2.5 1.9S10.6 7 12 7s2.5-.9 2.5-2.1S13.4 3 12 3Z" />
            <path d="M11.3 7.3c-1.5.1-2.7 1-2.7 2.2s1.3 2 2.9 1.9l1.2-.1c1.5-.1 2.7-1 2.7-2.2s-1.3-2-2.9-1.9l-1.2.1Z" />
            <path d="M11.6 11.8c-1.6.1-2.8 1-2.8 2.2s1.3 2.1 2.9 2l.8-.1c1.6-.1 2.8-1 2.8-2.2s-1.3-2.1-2.9-2l-.8.1Z" />
            <path d="M12 16.5c-1.4 0-2.5.9-2.5 2S10.6 21 12 21s2.5-1.3 2.5-2.5-.9-2-2.5-2Z" />
          </svg>
        </div>
        <div>
          <strong>Lumbar MRI</strong>
          <span>Analysis Platform</span>
        </div>
      </div>
      <nav className="side-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const selected = activeNavView === item.key;
          return (
            <button className={selected ? "active" : ""} key={item.key} onClick={() => onChangeView(item.key)} type="button" aria-current={selected ? "page" : undefined}>
              <span className="side-nav-label"><Icon aria-hidden size={18} />{item.label}</span>
              {item.badge && <em>{reviewQueueCount}</em>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <button className={activeNavView === "help" ? "active" : ""} type="button" onClick={() => onChangeView("help")} aria-current={activeNavView === "help" ? "page" : undefined}><HelpCircle aria-hidden size={16} />Help & Support</button>
        <span className={systemOnline ? "system-status is-online" : "system-status is-degraded"}><ShieldCheck aria-hidden size={16} />v1.3.2</span>
      </div>
    </aside>
  );
}
