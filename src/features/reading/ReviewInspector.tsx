import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type ReviewInspectorTab = "measurements" | "ai" | "review" | "more";

export const REVIEW_INSPECTOR_TABS: readonly { id: ReviewInspectorTab; label: string }[] = [
  { id: "measurements", label: "Mediciones" },
  { id: "ai", label: "Hallazgos IA" },
  { id: "review", label: "Revisión" },
  { id: "more", label: "Más" },
];

type Props = {
  activeTab: ReviewInspectorTab;
  onTabChange: (tab: ReviewInspectorTab) => void;
  children: ReactNode;
};

export function ReviewInspector({ activeTab, onTabChange, children }: Props) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % REVIEW_INSPECTOR_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + REVIEW_INSPECTOR_TABS.length) % REVIEW_INSPECTOR_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = REVIEW_INSPECTOR_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = REVIEW_INSPECTOR_TABS[nextIndex];
    onTabChange(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <aside aria-label="Inspector clínico" className="rr-panel">
      <div aria-label="Secciones del inspector" className="rr-tabs" role="tablist">
        {REVIEW_INSPECTOR_TABS.map((tab, index) => (
          <button
            aria-controls={`review-inspector-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            id={`review-inspector-tab-${tab.id}`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            ref={(node) => { tabRefs.current[index] = node; }}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rr-panel-body">{children}</div>
    </aside>
  );
}

type PanelProps = {
  activeTab: ReviewInspectorTab;
  tab: ReviewInspectorTab;
  children: ReactNode;
};

/** Se mantiene montado y sólo cambia su visibilidad para preservar drafts y selección. */
export function ReviewInspectorPanel({ activeTab, tab, children }: PanelProps) {
  return (
    <div
      aria-labelledby={`review-inspector-tab-${tab}`}
      hidden={activeTab !== tab}
      id={`review-inspector-panel-${tab}`}
      role="tabpanel"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
