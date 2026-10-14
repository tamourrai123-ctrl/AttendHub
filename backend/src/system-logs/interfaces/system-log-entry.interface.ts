export type SystemLogSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type SystemLogResource =
  | 'Company'
  | 'Integration'
  // Added for the HR Integration Gateway endpoint (integration_detail) CRUD
  // and test-endpoint capability — see src/integrations/endpoints.service.ts.
  // Purely additive: existing code that reads/compares SystemLogResource
  // values is unaffected by this new literal.
  | 'IntegrationEndpoint'
  // Added for Phase 4F (persistent custom field mapping,
  // integration_field_mapping) — see
  // src/integrations/field-mappings.service.ts. Purely additive, same as
  // 'IntegrationEndpoint' above.
  | 'FieldMapping'
  // Added for the live HR-employee capability (HrEmployeesController/
  // HrEmployeesService) — see src/integrations/hr-employees.controller.ts.
  // Purely additive, same as 'IntegrationEndpoint'/'FieldMapping' above.
  | 'HrEmployee'
  // Added for Phase 2/Part B (mobile attendance-punch forwarding) — see
  // src/integrations/attendance-punch.service.ts. Purely additive, same as
  // 'IntegrationEndpoint'/'FieldMapping'/'HrEmployee' above.
  | 'AttendancePunch'
  // Added for the mobile leave-application forwarding (src/integrations/leave-apply.service.ts). Purely additive.
  | 'LeaveApplication'
  | 'Settings'
  | 'Auth'
  | 'Employee'
  | 'Plan'
  | 'Platform';

export interface SystemLogEntry {
  id: string;
  /** ISO timestamp */
  timestamp: string;
  /** Display name of the actor, e.g. the logged-in user's name. */
  user: string;
  action: string;
  resource: SystemLogResource;
  resourceId?: string;
  severity: SystemLogSeverity;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface RecordSystemLogInput {
  user: string;
  action: string;
  resource: SystemLogResource;
  resourceId?: string;
  severity?: SystemLogSeverity;
  description: string;
  metadata?: Record<string, unknown>;
}
