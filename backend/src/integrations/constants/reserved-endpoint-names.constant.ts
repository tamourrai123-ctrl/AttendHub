/**
 * integration_detail has no column for an OAuth2 token URL, and per the
 * task's "no new/duplicate tables" instruction, no new table was added for
 * it either. Instead, an OAuth2 integration's token endpoint is configured
 * as an ordinary endpoint (integration_detail) row under the same
 * integration_id, using this exact, reserved `name` value.
 *
 * IntegrationEndpointExecutorService looks this row up (by
 * company_id + integration_id + name) only when the integration's
 * auth_type is OAUTH2, and uses its `endpoint`/`http_method` to build the
 * token request. A dedicated `token_url` column on integration_master
 * would remove the need for this convention — see the final report's
 * minimum-schema recommendations.
 */
export const OAUTH2_TOKEN_ENDPOINT_NAME = 'OAUTH2_TOKEN_ENDPOINT';

/**
 * Same convention, same reasoning, different purpose: integration_detail
 * has no "purpose"/"role" column to mark which of a company's configured
 * endpoints returns the HR system's employee list, so a Company Admin
 * marks it by naming that endpoint row exactly this value.
 *
 * HrEmployeesService looks this row up (by company_id + integration_id +
 * name) to serve both the live employee-list capability (the employee-
 * linking picker) and the single-employee live-detail lookup — the latter
 * reuses the same endpoint, passing `externalEmployeeId` as a query param
 * so it can fill a `{{externalEmployeeId}}` placeholder in the configured
 * endpoint path if the Company Admin's HR API supports per-id fetching;
 * if the path has no such placeholder, the call is a harmless no-op and
 * simply returns the full list, which HrEmployeesService then filters
 * client-side.
 */
export const EMPLOYEES_ENDPOINT_NAME = 'EMPLOYEES';

/**
 * Phase 2 (Company Admin — Endpoints/Mapping tab) additions, same
 * convention: a Company Admin marks which of their configured endpoints
 * serves each purpose by naming it exactly one of these reserved values.
 * See constants/endpoint-purposes.constant.ts, which pairs each of these
 * with its direction (INBOUND/OUTBOUND), expected HTTP method, and the
 * fixed set of AttendHub-side fields a mapping on that endpoint may use —
 * the fixed list requested for this phase (see the phase's own report),
 * scoped to exactly the fields the real HR API document supplied for
 * attendance/leave, not an open-ended set.
 *
 * ATTENDANCE_FETCH_ENDPOINT_NAME (Inbound/GET): reads an employee's
 * attendance history from the HR system, to display live in the portal —
 * read-only, mirrors AttendanceRecord's own field names.
 *
 * ATTENDANCE_POST_ENDPOINT_NAME (Outbound/POST): forwards an attendance
 * punch received from the mobile app onward to the HR system's attendance
 * endpoint — mirrors the exact field names ovacsol ERP's real
 * `post_attendance` endpoint expects.
 *
 * LEAVE_ENDPOINT_NAME (Inbound/GET): reads an employee's leave
 * balances/report from the HR system, to display live in the portal.
 */
export const ATTENDANCE_FETCH_ENDPOINT_NAME = 'ATTENDANCE_FETCH';
export const ATTENDANCE_POST_ENDPOINT_NAME = 'ATTENDANCE_POST';
export const LEAVE_ENDPOINT_NAME = 'LEAVE';

/**
 * Mobile Login addition, same reserved-name convention. A Company Admin
 * names one configured endpoint exactly this value to mark it as the HR
 * system's employee-authentication call.
 *
 * EMPLOYEE_LOGIN_ENDPOINT_NAME (Outbound/POST): the ONLY reserved purpose
 * whose mapping set is bidirectional (see endpoint-purposes.constant.ts's
 * requestFields/responseFields) — some of its mappings send AttendHub's own
 * request fields (username/password, as submitted by the mobile app) to
 * whatever field names the HR system's real login API expects, while
 * others read the HR system's response back to extract the field this
 * codebase calls "externalId" (the same identity key Employee Sync already
 * uses — see EmployeesService.findByExternalIdentity()), so a successful HR
 * login can be resolved to an already-linked AttendHub employee.
 * MobileAuthService (src/integrations/mobile-auth.service.ts) is the only
 * consumer. Employee credentials are NEVER checked against AttendHub's own
 * database — usm_users.c_password holds only a throwaway dummy value for
 * every employee (see PrismaEmployeesRepository.create()'s doc comment);
 * the connected HR system is always the real source of truth.
 */
export const EMPLOYEE_LOGIN_ENDPOINT_NAME = 'EMPLOYEE_LOGIN';

/**
 * Hub lookup purposes (GET /api/hr/...), same reserved-name convention. Each
 * is an Inbound/GET endpoint a Company Admin names exactly this value; the
 * path may use {{shortname}}, {{employeeId}} and {{wifiName}} placeholders,
 * which HrLookupService fills (URL-encoded) from the session / request body.
 */
export const SHIFT_RECORD_ENDPOINT_NAME = 'SHIFT_RECORD';
export const WIFI_INFO_ENDPOINT_NAME = 'WIFI_INFO';
export const COMPANY_INFO_ENDPOINT_NAME = 'COMPANY_INFO';
export const DEVICE_INFO_ENDPOINT_NAME = 'DEVICE_INFO';
export const ATTENDANCE_PUNCHES_ENDPOINT_NAME = 'ATTENDANCE_PUNCHES';

/** POST: creates the device's login session on the HR system (HR's "login_sessions" API). Outbound, bidirectional like EMPLOYEE_LOGIN. */
export const LOGIN_SESSION_ENDPOINT_NAME = 'LOGIN_SESSION';

/** POST: asks the HR system to generate a new QR token (HR's "post_qrcode_attendance" API — it replaces the previous token every 30 seconds). Outbound, no fields. */
export const QR_ATTENDANCE_ENDPOINT_NAME = 'QR_ATTENDANCE';
