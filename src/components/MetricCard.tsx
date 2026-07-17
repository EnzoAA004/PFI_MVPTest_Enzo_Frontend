import type * as React from "react";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon?: React.ReactNode;
  tone?: "blue" | "teal" | "green" | "amber" | "purple";
  actionLabel?: string;
  onAction?: () => void;
}

export function MetricCard({ label, value, detail, icon, tone = "blue", actionLabel, onAction }: MetricCardProps) {
  return (
    <article className={`metric-card metric-${tone}`} aria-label={label}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      {onAction && actionLabel && <button className="metric-action" onClick={onAction} type="button" aria-label={actionLabel}>Open</button>}
    </article>
  );
}
