import type { Priority, ReviewStatus } from "../types";

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: "blue" | "teal" | "green" | "amber" | "red" | "purple" | "slate";
}

export function StatusBadge({ children, tone = "slate" }: StatusBadgeProps) {
  return <span className={`status-badge badge-${tone}`}>{children}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone = priority === "alta" ? "red" : priority === "baja" ? "green" : "amber";
  return <StatusBadge tone={tone}>{priority}</StatusBadge>;
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const tone = status === "aceptado" ? "green" : status === "observado" ? "amber" : status === "descartado" ? "red" : "blue";
  return <StatusBadge tone={tone}>{status}</StatusBadge>;
}
