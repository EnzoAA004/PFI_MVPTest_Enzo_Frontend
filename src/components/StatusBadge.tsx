import type * as React from "react";
import type { Priority, ReviewStatus } from "../appTypes";
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
  return <StatusBadge tone={tone}>{priority}</StatusBadge>;
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const tone = status === "aceptado" ? "green" : status === "observado" ? "amber" : status === "descartado" ? "red" : "blue";
  return <StatusBadge tone={tone}>{status}</StatusBadge>;
}
