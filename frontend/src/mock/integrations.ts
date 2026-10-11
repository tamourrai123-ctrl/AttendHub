import type { MockFieldMapping, MockIntegration } from "../types/mockIntegration";

/** Standard Tamotam fields every integration maps external provider fields onto. */
export const STANDARD_FIELDS: { field: string; label: string }[] = [
  { field: "employeeId", label: "Employee ID" },
  { field: "employeeName", label: "Employee Name" },
  { field: "email", label: "Email" },
  { field: "checkIn", label: "Check In" },
  { field: "checkOut", label: "Check Out" },
  { field: "department", label: "Department" },
  { field: "leave", label: "Leave" },
];

function mapping(standardField: string, standardLabel: string, externalField: string): MockFieldMapping {
  return { standardField, standardLabel, externalField };
}

/** Mock "discovered" external fields, used to populate the Field Mapping dropdowns. */
export const MOCK_EXTERNAL_FIELDS: string[] = [
  "employee_code", "emp_id", "staff_id", "worker_id",
  "full_name", "name", "staff_name", "worker_name",
  "email_address", "email", "staff_email", "worker_email",
  "clock_in", "time_in", "check_in_time", "shift_start",
  "clock_out", "time_out", "check_out_time", "shift_end",
  "department_name", "dept", "division", "team", "store_department", "plant", "unit", "site",
  "leave_type", "leave_status",
];

/**
 * MOCK DATA — development only. Seed data for `mockIntegrationService`.
 *
 * `credentialsConfigured` is a boolean flag only — no actual API keys,
 * tokens, or secrets are stored here or anywhere else in the frontend.
 */
export const MOCK_INTEGRATIONS: MockIntegration[] = [
  {
    id: "int_001", companyId: "cmp_001", companyName: "ABC Pvt Ltd",
    integrationType: "REST API", provider: "Provider A", status: "CONNECTED",
    baseUrl: "https://api.abc-hr.test/v2", authType: "API_KEY", credentialsConfigured: true,
    lastSyncAt: "2026-09-11T10:50:00Z", lastTestResult: "PASSED", lastTestedAt: "2026-09-11T10:50:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "employee_code"),
      mapping("employeeName", "Employee Name", "full_name"),
      mapping("email", "Email", "email_address"),
      mapping("checkIn", "Check In", "clock_in"),
      mapping("checkOut", "Check Out", "clock_out"),
      mapping("department", "Department", "department_name"),
      mapping("leave", "Leave", "leave_type"),
    ],
  },
  {
    id: "int_002", companyId: "cmp_002", companyName: "XYZ Ltd",
    integrationType: "REST API", provider: "Provider B", status: "ERROR",
    baseUrl: "https://hr.xyz-systems.test/api", authType: "OAUTH2", credentialsConfigured: true,
    lastSyncAt: "2026-09-10T22:14:00Z", lastTestResult: "FAILED", lastTestedAt: "2026-09-11T10:33:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "emp_id"),
      mapping("employeeName", "Employee Name", "name"),
      mapping("email", "Email", "email"),
      mapping("checkIn", "Check In", "time_in"),
      mapping("checkOut", "Check Out", "time_out"),
      mapping("department", "Department", "dept"),
      mapping("leave", "Leave", ""),
    ],
  },
  {
    id: "int_003", companyId: "cmp_003", companyName: "DEF Industries",
    integrationType: "REST API", provider: "Provider A", status: "CONNECTED",
    baseUrl: "https://api.def-industries.test", authType: "BEARER_TOKEN", credentialsConfigured: true,
    lastSyncAt: "2026-09-11T08:10:00Z", lastTestResult: "PASSED", lastTestedAt: "2026-09-11T08:10:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "staff_id"),
      mapping("employeeName", "Employee Name", "staff_name"),
      mapping("email", "Email", "staff_email"),
      mapping("checkIn", "Check In", "check_in_time"),
      mapping("checkOut", "Check Out", "check_out_time"),
      mapping("department", "Department", "division"),
      mapping("leave", "Leave", "leave_status"),
    ],
  },
  {
    id: "int_004", companyId: "cmp_004", companyName: "Nova Textiles",
    integrationType: "SOAP", provider: "Provider C", status: "TESTING",
    baseUrl: "https://legacy.novatextiles.test/soap", authType: "BASIC_AUTH", credentialsConfigured: false,
    lastSyncAt: null, lastTestResult: null, lastTestedAt: null,
    fieldMappings: [
      mapping("employeeId", "Employee ID", ""),
      mapping("employeeName", "Employee Name", ""),
      mapping("email", "Email", ""),
      mapping("checkIn", "Check In", ""),
      mapping("checkOut", "Check Out", ""),
      mapping("department", "Department", ""),
      mapping("leave", "Leave", ""),
    ],
  },
  {
    id: "int_005", companyId: "cmp_005", companyName: "Skyline Foods",
    integrationType: "REST API", provider: "Provider B", status: "DISCONNECTED",
    baseUrl: "https://api.skylinefoods.test", authType: "API_KEY", credentialsConfigured: false,
    lastSyncAt: "2026-08-01T09:00:00Z", lastTestResult: "FAILED", lastTestedAt: "2026-08-02T11:00:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "employee_code"),
      mapping("employeeName", "Employee Name", "full_name"),
      mapping("email", "Email", "email_address"),
      mapping("checkIn", "Check In", "clock_in"),
      mapping("checkOut", "Check Out", "clock_out"),
      mapping("department", "Department", ""),
      mapping("leave", "Leave", ""),
    ],
  },
  {
    id: "int_006", companyId: "cmp_006", companyName: "Horizon Tech",
    integrationType: "REST API", provider: "Provider A", status: "CONNECTED",
    baseUrl: "https://api.horizontech.test/v3", authType: "OAUTH2", credentialsConfigured: true,
    lastSyncAt: "2026-09-11T09:45:00Z", lastTestResult: "PASSED", lastTestedAt: "2026-09-11T09:45:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "employee_code"),
      mapping("employeeName", "Employee Name", "full_name"),
      mapping("email", "Email", "email_address"),
      mapping("checkIn", "Check In", "clock_in"),
      mapping("checkOut", "Check Out", "clock_out"),
      mapping("department", "Department", "department_name"),
      mapping("leave", "Leave", "leave_type"),
    ],
  },
  {
    id: "int_007", companyId: "cmp_007", companyName: "Coastal Logistics",
    integrationType: "REST API", provider: "Provider D", status: "WARNING",
    baseUrl: "https://api.coastallogistics.test", authType: "API_KEY", credentialsConfigured: true,
    lastSyncAt: "2026-09-10T16:38:00Z", lastTestResult: "PASSED", lastTestedAt: "2026-09-10T16:38:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "worker_id"),
      mapping("employeeName", "Employee Name", "worker_name"),
      mapping("email", "Email", "worker_email"),
      mapping("checkIn", "Check In", "shift_start"),
      mapping("checkOut", "Check Out", "shift_end"),
      mapping("department", "Department", "team"),
      mapping("leave", "Leave", ""),
    ],
  },
  {
    id: "int_008", companyId: "cmp_008", companyName: "Bright Retail Group",
    integrationType: "REST API", provider: "Provider A", status: "CONNECTED",
    baseUrl: "https://api.brightretail.test", authType: "BEARER_TOKEN", credentialsConfigured: true,
    lastSyncAt: "2026-09-11T07:00:00Z", lastTestResult: "PASSED", lastTestedAt: "2026-09-11T07:00:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "employee_code"),
      mapping("employeeName", "Employee Name", "full_name"),
      mapping("email", "Email", "email_address"),
      mapping("checkIn", "Check In", "clock_in"),
      mapping("checkOut", "Check Out", "clock_out"),
      mapping("department", "Department", "store_department"),
      mapping("leave", "Leave", "leave_type"),
    ],
  },
  {
    id: "int_009", companyId: "cmp_009", companyName: "Pinnacle Construction",
    integrationType: "REST API", provider: "Provider B", status: "CONNECTED",
    baseUrl: "https://api.pinnacleconstruction.test", authType: "API_KEY", credentialsConfigured: true,
    lastSyncAt: "2026-09-09T13:20:00Z", lastTestResult: "PASSED", lastTestedAt: "2026-09-09T13:20:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "emp_id"),
      mapping("employeeName", "Employee Name", "name"),
      mapping("email", "Email", "email"),
      mapping("checkIn", "Check In", "time_in"),
      mapping("checkOut", "Check Out", "time_out"),
      mapping("department", "Department", "site"),
      mapping("leave", "Leave", ""),
    ],
  },
  {
    id: "int_011", companyId: "cmp_011", companyName: "Vantage Manufacturing",
    integrationType: "REST API", provider: "Provider C", status: "CONNECTED",
    baseUrl: "https://api.vantagemfg.test", authType: "OAUTH2", credentialsConfigured: true,
    lastSyncAt: "2026-09-11T06:10:00Z", lastTestResult: "PASSED", lastTestedAt: "2026-09-11T06:10:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "employee_code"),
      mapping("employeeName", "Employee Name", "full_name"),
      mapping("email", "Email", "email_address"),
      mapping("checkIn", "Check In", "clock_in"),
      mapping("checkOut", "Check Out", "clock_out"),
      mapping("department", "Department", "plant"),
      mapping("leave", "Leave", "leave_type"),
    ],
  },
  {
    id: "int_012", companyId: "cmp_012", companyName: "Crestwood Pharma",
    integrationType: "REST API", provider: "Provider D", status: "ERROR",
    baseUrl: "https://api.crestwoodpharma.test", authType: "API_KEY", credentialsConfigured: true,
    lastSyncAt: "2026-09-10T20:00:00Z", lastTestResult: "FAILED", lastTestedAt: "2026-09-11T05:58:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "employee_code"),
      mapping("employeeName", "Employee Name", "full_name"),
      mapping("email", "Email", "email_address"),
      mapping("checkIn", "Check In", "clock_in"),
      mapping("checkOut", "Check Out", "clock_out"),
      mapping("department", "Department", ""),
      mapping("leave", "Leave", ""),
    ],
  },
  {
    id: "int_013", companyId: "cmp_013", companyName: "Lakeside Energy",
    integrationType: "REST API", provider: "Provider A", status: "CONNECTED",
    baseUrl: "https://api.lakesideenergy.test", authType: "BEARER_TOKEN", credentialsConfigured: true,
    lastSyncAt: "2026-09-08T12:28:00Z", lastTestResult: "PASSED", lastTestedAt: "2026-09-08T12:28:00Z",
    fieldMappings: [
      mapping("employeeId", "Employee ID", "employee_code"),
      mapping("employeeName", "Employee Name", "full_name"),
      mapping("email", "Email", "email_address"),
      mapping("checkIn", "Check In", "clock_in"),
      mapping("checkOut", "Check Out", "clock_out"),
      mapping("department", "Department", "unit"),
      mapping("leave", "Leave", "leave_type"),
    ],
  },
];
