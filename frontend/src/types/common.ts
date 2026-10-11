import type { ReactNode, ComponentType } from "react";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export type BadgeStatus =
  | "active"
  | "inactive"
  | "connected"
  | "disconnected"
  | "pending"
  | "error"
  | "suspended"
  | "warning"
  | "testing"
  | "critical"
  | "info";

export interface StatDatum {
  label: string;
  value: string | number;
  helpText?: string;
  trend?: {
    direction: "up" | "down" | "flat";
    value: string;
  };
}

export interface ActivityItem {
  id: string;
  message: string;
  timestamp: string;
  tone: "success" | "warning" | "error" | "info";
}

export interface TableColumn<T> {
  key: string;
  /** Usually a plain string; can be a ReactNode (e.g. a sortable header button). */
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface NavItemDefinition {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}
