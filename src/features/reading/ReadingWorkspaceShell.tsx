import type { ReactNode } from "react";

export function ReadingWorkspaceShell({ children }: { children: ReactNode }) {
  return <div className="rr" data-theme="reading">{children}</div>;
}

export function ReadingWorkspaceHeader({ children }: { children: ReactNode }) {
  return <header className="rr-topbar">{children}</header>;
}

export function ReadingWorkspaceBody({
  children,
  inspectorCollapsed,
}: {
  children: ReactNode;
  inspectorCollapsed: boolean;
}) {
  return <div className="rr-body" data-inspector={inspectorCollapsed ? "collapsed" : "visible"}>{children}</div>;
}

export function ReadingWorkspaceToolbar({ children }: { children: ReactNode }) {
  return <div className="rr-toolbar" role="toolbar" aria-label="Herramientas de lectura">{children}</div>;
}
