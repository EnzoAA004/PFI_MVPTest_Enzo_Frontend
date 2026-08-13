import type * as React from "react";
import type { Priority, ReviewStatus } from "../appTypes";
import { displayReviewStatus } from "../clinicalDisplay";
import { StatusBadge as BaseStatusBadge } from "../design/primitives";

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: "blue" | "teal" | "green" | "amber" | "red" | "purple" | "slate";
}

export function StatusBadge({ children, tone = "slate" }: StatusBadgeProps) {
  return <BaseStatusBadge tone={tone}>{children}</BaseStatusBadge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone = priority === "alta" ? "red" : priority === "baja" ? "slate" : "amber";
  return <StatusBadge tone={tone}>{priority[0].toUpperCase()}{priority.slice(1)}</StatusBadge>;
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={`study-status study-status-${status}`}>
      <span aria-hidden="true" className="study-status-mark" />
      {displayReviewStatus(status)}
    </span>
  );
}
