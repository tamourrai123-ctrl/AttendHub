export type LogSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

/**
 * Matches backend/src/system-logs/interfaces/system-log-entry.interface.ts's
 * SystemLogResource exactly, including the entries added for HR Integration
 * Gateway endpoints, field mappings, and the live HR-employee capability.
 * Kept in sync manually since the frontend has no shared-types package with
 * the backend — if the backend adds another resource literal, add it here
 * too or the resource filter/column will silently show an unrecognized
 * string rather than erroring (TypeScript can't catch a value that only
 * ever flows through as untyped JSON from the network).
 */
export type SystemLogResource =
  | "Company"
  | "Integration"
  | "IntegrationEndpoint"
  | "FieldMapping"
  | "HrEmployee"
  | "Settings"
  | "Auth"
  | "Employee"
  | "Plan"
  | "Platform";

export interface SystemLog {
  id: string;
  /** ISO timestamp */
  timestamp: string;
  user: string;
  action: string;
  resource: SystemLogResource;
  resourceId?: string;
  severity: LogSeverity;
  description: string;
}

export interface SystemLogDetail extends SystemLog {
  metadata: Record<string, unknown>;
}
