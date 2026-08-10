import type { ReactNode } from "react";
import type { ReadingLayoutPreset } from "./readingWorkspaceLayout";

export function ViewportGrid({
  children,
  preset,
}: {
  children: ReactNode;
  preset: ReadingLayoutPreset;
}) {
  return (
    <main className="rr-stage" data-layout={preset === "reading" ? "single" : "dual"} data-preset={preset}>
      {children}
    </main>
  );
}
