import type { InputHTMLAttributes, ReactNode, TableHTMLAttributes } from "react";

type Tone = "blue" | "teal" | "green" | "amber" | "red" | "purple" | "slate";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel-card ds-card ${className}`.trim()}>{children}</section>;
}

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variantClass = variant === "primary" ? "primary-button" : variant === "ghost" ? "ghost-button" : variant === "danger" ? "danger-button" : "secondary-button";
  return <button className={`${variantClass} ds-button ${className}`.trim()} type="button" {...props}>{children}</button>;
}

export function StatusBadge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`status-badge badge-${tone}`}>{children}</span>;
}

export function ConfidenceBadge({ value }: { value: number }) {
  const percent = value > 1 ? value : value * 100;
  const tone: Tone = percent >= 85 ? "green" : percent >= 70 ? "amber" : "red";
  return <StatusBadge tone={tone}>{Math.round(percent)}%</StatusBadge>;
}

export function PriorityTag({ priority }: { priority: "High" | "Medium" | "Low" | "alta" | "media" | "baja" }) {
  const normalized = priority.toLowerCase();
  const tone: Tone = normalized === "high" || normalized === "alta" ? "red" : normalized === "medium" || normalized === "media" ? "amber" : "slate";
  return <StatusBadge tone={tone}>{priority}</StatusBadge>;
}

export function Tab({ children, active = false, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button className={`ds-tab ${active ? "active" : ""} ${className}`.trim()} role="tab" aria-selected={active} type="button" {...props}>{children}</button>;
}

export function Table({ className = "", ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={`worklist-table ds-table ${className}`.trim()} {...props} />;
}

export function FormField({
  id,
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string }) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <label className="ds-form-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} aria-describedby={errorId} aria-invalid={Boolean(error)} {...props} />
      {error && <small id={errorId}>{error}</small>}
    </label>
  );
}

export function Toggle({ checked, label, onChange, disabled }: { checked: boolean; label: string; onChange: () => void; disabled?: boolean }) {
  return (
    <button className={checked ? "ios-switch is-on" : "ios-switch is-off"} type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}>
      <span className="ios-switch-thumb" />
    </button>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="panel-hidden-placeholder ds-empty-state"><strong>{title}</strong><span>{detail}</span></div>;
}

export function Toast({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return <div className={`toast ${tone}`} role="status">{children}</div>;
}


