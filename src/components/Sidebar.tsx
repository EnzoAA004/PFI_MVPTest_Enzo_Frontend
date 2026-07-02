import type { ViewKey } from "../appTypes";

const navItems: Array<{ key: ViewKey | "studies" | "queue" | "patients"; label: string; badge?: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "studies", label: "Studies" },
  { key: "queue", label: "Review Queue", badge: "14" },
  { key: "patients", label: "Patients" },
  { key: "history", label: "History" },
  { key: "settings", label: "Settings" },
];

interface SidebarProps {
  activeView: ViewKey;
  onChangeView: (view: ViewKey) => void;
}

export function Sidebar({ activeView, onChangeView }: SidebarProps) {
  function resolveTarget(key: string): ViewKey {
    if (key === "history" || key === "patients") return "history";
    if (key === "studies" || key === "queue") return "review";
    if (key === "settings") return "settings";
    return "dashboard";
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">LM</div>
        <div>
          <strong>Lumbar MRI</strong>
          <span>Analysis Platform</span>
        </div>
      </div>
      <nav className="side-nav">
        {navItems.map((item) => {
          const target = resolveTarget(item.key);
          return (
            <button className={activeView === target ? "active" : ""} key={item.key} onClick={() => onChangeView(target)} type="button">
              <span>{item.label}</span>
              {item.badge && <em>{item.badge}</em>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <span>v1.3.2</span>
        <button type="button">Help & Support</button>
      </div>
    </aside>
  );
}
