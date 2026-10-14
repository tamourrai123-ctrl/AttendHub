import { EndpointDirection, EndpointHttpMethod } from '../interfaces/endpoint.interface';
import {
  ATTENDANCE_FETCH_ENDPOINT_NAME,
  ATTENDANCE_POST_ENDPOINT_NAME,
  LEAVE_ENDPOINT_NAME,
  EMPLOYEES_ENDPOINT_NAME,
  EMPLOYEE_LOGIN_ENDPOINT_NAME,
  SHIFT_RECORD_ENDPOINT_NAME,
  WIFI_INFO_ENDPOINT_NAME,
  COMPANY_INFO_ENDPOINT_NAME,
  DEVICE_INFO_ENDPOINT_NAME,
  ATTENDANCE_PUNCHES_ENDPOINT_NAME,
  LOGIN_SESSION_ENDPOINT_NAME,
  QR_ATTENDANCE_ENDPOINT_NAME,
  LEAVE_POST_ENDPOINT_NAME,
  HOLIDAYS_ENDPOINT_NAME,
  ANNOUNCEMENTS_ENDPOINT_NAME,
} from './reserved-endpoint-names.constant';

/**
 * One AttendHub-side field a mapping on a "purpose" endpoint may use —
 * `field` is the exact string stored as targetField (Inbound purposes) or
 * sourcePath (Outbound purposes); `label` is only for display.
 */
export interface EndpointPurposeField {
  field: string;
  label: string;
}

export interface EndpointPurposeDefinition {
  /** The exact integration_detail.name value that identifies an endpoint as serving this purpose — see reserved-endpoint-names.constant.ts. */
  name: string;
  label: string;
  direction: EndpointDirection;
  defaultHttpMethod: EndpointHttpMethod;
  /**
   * Optional. When set, EndpointsService accepts ANY of these methods for
   * this purpose instead of only `defaultHttpMethod`. Left undefined on every
   * purpose except EMPLOYEE_LOGIN, so those keep exactly one allowed method.
   */
  allowedHttpMethods?: EndpointHttpMethod[];
  description: string;
  /** True for purposes the HR API document does not list: kept for existing setups, but not offered when adding a new endpoint. */
  hideFromPicker?: boolean;
  /**
   * The fixed set of AttendHub-side fields this purpose's mappings may
   * target (Inbound) or source from (Outbound). Deliberately NOT an
   * open-ended list — see this constant's own doc comment below for why —
   * and deliberately NOT every field a real HR system might expose;
   * additional fields are an explicitly deferred, later decision.
   *
   * Empty (`[]`) for a bidirectional purpose (see requestFields/
   * responseFields below) — those two replace this list's job for such a
   * purpose, and FieldMappingsService.assertFieldAllowedForPurpose() checks
   * for their presence before ever consulting this field.
   */
  fields: EndpointPurposeField[];
  /**
   * Set only on a purpose whose single HTTP call needs BOTH directions
   * mapped at once — currently only EMPLOYEE_LOGIN: some mappings send
   * AttendHub's own fields (e.g. username/password) to the HR system,
   * others read the HR system's response back into an AttendHub field
   * (e.g. externalId). Every other purpose is one-directional and leaves
   * this undefined, using `fields` instead.
   */
  requestFields?: EndpointPurposeField[];
  /** Paired with requestFields above — see that field's doc comment. */
  responseFields?: EndpointPurposeField[];
}

/**
 * The fixed "what is this endpoint for" catalogue for Phase 2. A Company
 * Admin building an Inbound or Outbound endpoint picks one of these
 * purposes (see EndpointsPanel on the frontend); picking one locks the
 * endpoint's `name` to the matching reserved value (so HrEmployeesService's
 * sibling services in a later phase can find it the same way
 * HrEmployeesService already finds "EMPLOYEES") and its httpMethod to
 * `defaultHttpMethod` (EndpointsService.create()/update() enforce this
 * match — see that file).
 *
 * The `fields` lists below are deliberately restricted to exactly the
 * fields named in the real ovacsol ERP API document the product owner
 * supplied for this phase (Attendance post_attendance JSON body; Leave
 * Report's returned fields) plus AttendHub's own existing AttendanceRecord
 * field names for the Attendance-fetch side (since that Inbound purpose's
 * job is to feed AttendHub's own attendance display, not to mirror any
 * particular HR vendor's field names) — NOT a general-purpose, open-ended
 * field catalogue. This was an explicit, discussed decision: keep the
 * fixed list to only what attendance actually needs for this initial
 * version, and revisit/extend it in a later phase if a real integration
 * needs a field this list doesn't yet have.
 *
 * Phase 2/Part C addition: LEAVE now also lists `employeeCode` — without it
 * there is no field a mapping could target that tells AttendHub WHICH of
 * its own employees a fetched leave-balance row belongs to (unlike
 * ATTENDANCE_FETCH, which already had this field from the start). This is
 * required for the live Leave display to resolve each row back to an
 * AttendHub employee (see LeaveService) — not an open-ended addition, just
 * completing what the purpose already needed to work at all.
 *
 * Employee Sync addition: EMPLOYEES was already a reserved endpoint name
 * (see reserved-endpoint-names.constant.ts) used by HrEmployeesService for
 * the live employee-linking picker, but it had no entry here — so it had no
 * fixed field list, no guided dropdown, and none of the
 * assertFieldAllowedForPurpose/assertHttpMethodMatchesPurpose enforcement
 * every other purpose gets. Adding it here activates that same enforcement
 * for EMPLOYEES, and gives EmployeeSyncService a fixed, guaranteed field
 * shape (externalId/name/email) to read from every mapped HR employee
 * record, the same way ATTENDANCE_FETCH/LEAVE already give
 * AttendanceService/LeaveService a guaranteed shape.
 *
 * FieldMappingsService validates every create/update against whichever of
 * these lists applies to the mapping's parent endpoint (see that file) —
 * this is enforced server-side, not merely a frontend dropdown convenience.
 */
export const ENDPOINT_PURPOSES: EndpointPurposeDefinition[] = [
  {
    name: ATTENDANCE_FETCH_ENDPOINT_NAME,
    label: 'Attendance History (fetch from HR)',
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      "Reads an employee's attendance history from the HR system, so it can be shown live on the portal. Map " +
      "the HR system's response fields to these.",
    fields: [
      { field: 'companyId', label: 'Company ID' },
      { field: 'punchId', label: 'Record ID' },
      { field: 'employeeName', label: 'Employee Name' },
      { field: 'employeeImage', label: 'Employee Image (selfie, base64)' },
      { field: 'punchTime', label: 'Punch Time' },
      { field: 'state', label: 'State' },
      { field: 'source', label: 'Punch Source' },
      { field: 'latitude', label: 'Latitude' },
      { field: 'longitude', label: 'Longitude' },
      { field: 'wifi', label: 'WiFi' },
      { field: 'qrCode', label: 'QR Code' },
      { field: 'wifiCheckStatus', label: 'WiFi Check Status' },
      { field: 'androidId', label: 'Device (Android) ID' },
      { field: 'appVersion', label: 'App Version' },
    ],
  },
  {
    name: ATTENDANCE_POST_ENDPOINT_NAME,
    label: 'Post Attendance (send to HR)',
    direction: 'OUTBOUND',
    defaultHttpMethod: 'POST',
    description:
      'Forwards an attendance punch received from the mobile app onward to the HR system. Map these AttendHub ' +
      "fields to whatever field names the HR system's API expects.",
    fields: [
      { field: 'companyId', label: 'Company ID' },
      { field: 'employeeCode', label: 'Employee Code' },
      { field: 'punchTime', label: 'Punch Time' },
      { field: 'state', label: 'State' },
      { field: 'source', label: 'Source' },
      { field: 'latitude', label: 'Latitude' },
      { field: 'longitude', label: 'Longitude' },
      { field: 'wifi', label: 'WiFi Name' },
      { field: 'qrCode', label: 'QR Code' },
      { field: 'addedBy', label: 'Added By' },
      { field: 'employeeImage', label: 'Employee Image (base64)' },
      { field: 'filename', label: 'Filename' },
      { field: 'fileMimetype', label: 'File Mimetype' },
      { field: 'fileCharset', label: 'File Charset' },
      { field: 'docFileId', label: 'Document File ID' },
      { field: 'pushToken', label: 'Push Token' },
      { field: 'wifiCheckStatus', label: 'WiFi Check Status' },
      { field: 'manualLogoutFlag', label: 'Manual Logout Flag' },
      { field: 'appVersion', label: 'App Version' },
    ],
  },
  {
    name: LEAVE_ENDPOINT_NAME,
    label: 'Leave Report (fetch from HR)',
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      "Reads an employee's leave balances/report from the HR system, so it can be shown live on the portal. Map " +
      "the HR system's response fields to these.",
    fields: [
      { field: 'companyId', label: 'Company ID' },
      { field: 'employeeName', label: 'Employee Name' },
      { field: 'leaveType', label: 'Leave Type' },
      { field: 'totalLeaveDays', label: 'Total Leave Days' },
      { field: 'entitledLeave', label: 'Entitled Leave' },
      { field: 'consumedLeave', label: 'Consumed Leave' },
      { field: 'availableLeaveBalance', label: 'Available Leave Balance' },
      { field: 'leaveStatus', label: 'Official Leave Status' },
    ],
  },
  {
    name: EMPLOYEES_ENDPOINT_NAME,
    label: 'Employees (fetch from HR)',
    hideFromPicker: true,
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      "Reads the HR system's employee list. Used both for the live employee-linking picker " +
      "(HrEmployeesService) and for continuous employee sync into AttendHub (EmployeeSyncService) — map the HR " +
      "system's response fields to these.",
    fields: [
      { field: 'externalId', label: 'Employee ID (HR system)' },
      { field: 'name', label: 'Full Name' },
      { field: 'email', label: 'Email Address' },
    ],
  },
  {
    name: EMPLOYEE_LOGIN_ENDPOINT_NAME,
    label: 'Authentication (employee login)',
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    // The HR document's Authentication API is a GET: short name, user name and password go in the URL path.
    description:
      "Forwards the mobile app's login attempt to the HR system for verification, then reads the HR " +
      "system's response to identify which employee logged in. The only purpose with mappings on both sides — " +
      "map your own username/password fields to whatever the HR login API expects to receive, AND map the " +
      "HR response's employee-id field to \"externalId\" so AttendHub can resolve it to an already-linked " +
      "employee (see Employee Sync). Employee passwords are never checked against AttendHub's own database.",
    fields: [],
    requestFields: [
      { field: 'username', label: 'Username / Employee Code (sent to HR)' },
      { field: 'password', label: 'Password (sent to HR)' },
    ],
    responseFields: [
      { field: 'externalId', label: "Employee ID (HR's employee_id)" },
      { field: 'name', label: 'Employee Name' },
      { field: 'userId', label: 'User ID' },
      { field: 'companyId', label: 'Company ID (HR\'s id)' },
      { field: 'userName', label: 'User Name' },
      { field: 'cPassword', label: 'Password (c_password)' },
      { field: 'imeiNumber', label: 'IMEI Number' },
      { field: 'geoFencing', label: 'Geo Fencing' },
      { field: 'wifiValidation', label: 'WiFi Validation' },
      { field: 'selfieMandatory', label: 'Selfie Mandatory' },
      { field: 'mockGpsDetection', label: 'Mock GPS Detection' },
      { field: 'developerOptions', label: 'Developer Options' },
      { field: 'defaultGeoRadius', label: 'Default Geo Radius' },
      { field: 'offlineAttendanceAllowed', label: 'Offline Attendance Allowed' },
      { field: 'breakFlag', label: 'Break Flag' },
      { field: 'legacyCode', label: 'Legacy Code' },
      { field: 'latitude', label: 'Latitude' },
      { field: 'longitude', label: 'Longitude' },
      { field: 'androidId', label: 'Android ID' },
    ],
  },
  {
    name: SHIFT_RECORD_ENDPOINT_NAME,
    label: 'Shift Record (fetch from HR)',
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      "Reads the logged-in employee's current shift from the HR system (GET /api/hr/shift). The path may use " +
      '{{shortname}} and {{employeeId}} — both are filled automatically. Map the HR response fields to these.',
    fields: [
      { field: 'companyId', label: 'Company ID' },
      { field: 'shiftMonthId', label: 'Shift Month ID' },
      { field: 'shiftDetailId', label: 'Shift Detail ID' },
      { field: 'changeHours', label: 'Change Hours' },
      { field: 'startAt', label: 'Shift Start (date & time)' },
      { field: 'endAt', label: 'Shift End (date & time)' },
      { field: 'graceAt', label: 'Grace Time (date & time)' },
      { field: 'totalHours', label: 'Total Working Hours' },
      { field: 'restPeriod', label: 'Rest Period' },
    ],
  },
  {
    name: WIFI_INFO_ENDPOINT_NAME,
    label: 'WiFi Information (fetch from HR)',
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      'Reads one office WiFi record by name from the HR system (POST /api/hr/wifi with {"wifiName": "..."}). The path ' +
      'may use {{shortname}} and {{wifiName}} — both are filled automatically. Map the HR response fields to these ' +
      '(use the Test button\'s detected fields).',
    fields: [
      { field: 'wifiName', label: 'WiFi Name' },
      { field: 'bssid', label: 'WiFi BSSID (MAC address)' },
      { field: 'ipAddress', label: 'IP Address' },
      { field: 'location', label: 'Location' },
      { field: 'status', label: 'Status' },
    ],
  },
  {
    name: COMPANY_INFO_ENDPOINT_NAME,
    label: 'Company Information (fetch from HR)',
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      "Reads the company's own settings from the HR system (GET /api/hr/company-info). The path may use " +
      '{{shortname}}, which is filled automatically. Map the HR response fields to these.',
    fields: [
      { field: 'companyId', label: 'Company ID' },
      { field: 'title', label: 'Company Name' },
      { field: 'shortName', label: 'Company Short Name' },
      { field: 'address', label: 'Address' },
      { field: 'geoFencing', label: 'Geo Fencing' },
      { field: 'wifiValidation', label: 'WiFi Validation' },
      { field: 'selfieMandatory', label: 'Selfie Mandatory' },
      { field: 'mockGpsDetection', label: 'Mock GPS Detection' },
      { field: 'developerOptions', label: 'Developer Options' },
      { field: 'defaultGeoRadius', label: 'Default Geo Radius' },
      { field: 'offlineAttendanceAllowed', label: 'Offline Attendance Allowed' },
      { field: 'serverTime', label: 'Server Time' },
      { field: 'timeZone', label: 'Time Zone' },
      { field: 'latitude', label: 'Latitude' },
      { field: 'longitude', label: 'Longitude' },
    ],
  },
  {
    name: DEVICE_INFO_ENDPOINT_NAME,
    label: 'Device Info (fetch from HR) — Company Admin only',
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      'Reads one user\'s device/session record from the HR system (POST /api/hr/device-info with {"username": "..."}, ' +
      'Company Admin only). The path may use {{shortname}} and {{username}} — both are filled automatically. ' +
      'The access/refresh tokens are read live from HR for the Company Admin only; they are never stored or logged.',
    fields: [
      { field: 'companyName', label: 'Company Name' },
      { field: 'tokenId', label: 'Token ID' },
      { field: 'userId', label: 'User ID' },
      { field: 'userName', label: 'User Name' },
      { field: 'accessToken', label: 'Access Token' },
      { field: 'refreshToken', label: 'Refresh Token' },
      { field: 'accessTokenExpiry', label: 'Access Token Expiry Time' },
      { field: 'refreshTokenExpiry', label: 'Refresh Token Expiry Time' },
      { field: 'deviceId', label: 'Device ID' },
      { field: 'deviceName', label: 'Device Name' },
      { field: 'appVersion', label: 'App Version' },
      { field: 'ipAddress', label: 'IP Address' },
      { field: 'lastAccessTime', label: 'Last Access Time' },
      { field: 'status', label: 'Token Status' },
      { field: 'createdOn', label: 'Token Creation Date' },
    ],
  },
  {
    name: ATTENDANCE_PUNCHES_ENDPOINT_NAME,
    label: 'Attendance Punches — raw, one row per punch (fetch from HR)',
    hideFromPicker: true,
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      "Reads the logged-in employee's raw punch history from the HR system (GET /api/hr/attendance-punches): one row per " +
      'check-in/check-out, exactly as HR returns it — the hub does NOT group punches into days (the app does). The path ' +
      'may use {{shortname}} and {{name}} (the employee\'s name as stored in AttendHub, URL-encoded; it must match the ' +
      "spelling in the HR system). The selfie image is deliberately not available as a field.",
    fields: [
      { field: 'companyId', label: 'Company ID' },
      { field: 'punchId', label: 'Punch Record ID' },
      { field: 'employeeName', label: 'Employee Name' },
      { field: 'employeeImage', label: 'Employee Image (selfie, base64)' },
      { field: 'punchTime', label: 'Punch Time' },
      { field: 'state', label: 'State (check-in / check-out)' },
      { field: 'source', label: 'Punch Source' },
      { field: 'latitude', label: 'Latitude' },
      { field: 'longitude', label: 'Longitude' },
      { field: 'wifi', label: 'WiFi' },
      { field: 'qrCode', label: 'QR Code' },
      { field: 'wifiCheckStatus', label: 'WiFi Check Status' },
      { field: 'androidId', label: 'Device (Android) ID' },
      { field: 'appVersion', label: 'App Version' },
    ],
  },
  {
    name: LOGIN_SESSION_ENDPOINT_NAME,
    label: 'Login Session — register device (send to HR)',
    direction: 'OUTBOUND',
    defaultHttpMethod: 'POST',
    description:
      "Creates the device's login session on the HR system (HR's login_sessions API, POST JSON). Map AttendHub's " +
      'fields to the field names HR expects; only the fields you map are sent. The session values are sent to HR ' +
      'on every login and are never stored or logged by the hub.',
    fields: [],
    requestFields: [
      { field: 'companyId', label: 'Company ID (from the session)' },
      { field: 'userId', label: 'HR User ID' },
      { field: 'accessToken', label: 'Access Token (this app session)' },
      { field: 'refreshToken', label: 'Refresh Token (this app session)' },
      { field: 'accessTokenExpiry', label: 'Access Token Expiry Time' },
      { field: 'refreshTokenExpiry', label: 'Refresh Token Expiry Time' },
      { field: 'deviceId', label: 'Device ID' },
      { field: 'deviceName', label: 'Device Name' },
      { field: 'appVersion', label: 'App Version' },
      { field: 'ipAddress', label: 'IP Address' },
      { field: 'lastAccessTime', label: 'Last Access Time' },
      { field: 'status', label: 'Session Status (ACTIVE / EXPIRED)' },
      { field: 'createdOn', label: 'Session Creation Date' },
    ],
  },
  {
    name: QR_ATTENDANCE_ENDPOINT_NAME,
    label: 'QR Code Attendance — generate QR token (send to HR)',
    direction: 'OUTBOUND',
    defaultHttpMethod: 'POST',
    description:
      "Asks the HR system to generate a new QR token (HR's post_qrcode_attendance API, POST). HR replaces the previous " +
      'token every 30 seconds. The API document lists no request or response fields, so there is nothing to map: the ' +
      'hub only forwards the call and reports whether HR accepted it. Employees then punch with the scanned code ' +
      'through the Post Attendance endpoint\'s "QR Code" field.',
    fields: [],
  },
  {
    name: LEAVE_POST_ENDPOINT_NAME,
    label: 'Apply for Leave (send to HR)',
    direction: 'OUTBOUND',
    defaultHttpMethod: 'POST',
    description:
      'Forwards a leave application received from the mobile app (POST /api/hr/leave) to the HR system. Map these ' +
      "AttendHub fields to whatever field names the HR system's leave-application API expects; only the fields you " +
      'map are sent. Nothing is stored on the hub side.',
    fields: [
      { field: 'companyId', label: 'Company ID' },
      { field: 'employeeCode', label: 'Employee Code' },
      { field: 'employeeName', label: 'Employee Name' },
      { field: 'leaveType', label: 'Leave Type' },
      { field: 'fromDate', label: 'From Date' },
      { field: 'toDate', label: 'To Date' },
      { field: 'totalDays', label: 'Total Days' },
      { field: 'reason', label: 'Reason' },
      { field: 'appliedOn', label: 'Applied On' },
      { field: 'source', label: 'Source' },
    ],
  },
  {
    name: HOLIDAYS_ENDPOINT_NAME,
    label: 'Holidays (fetch from HR)',
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      "Reads the company's holiday list from the HR system for the mobile app (GET /api/hr/holidays). The path may use " +
      '{{shortname}} and {{employeeId}}. Map the HR system\'s response fields to these.',
    fields: [
      { field: 'companyId', label: 'Company ID' },
      { field: 'holidayDate', label: 'Holiday Date' },
      { field: 'title', label: 'Holiday Name' },
      { field: 'description', label: 'Description' },
      { field: 'holidayType', label: 'Holiday Type' },
    ],
  },
  {
    name: ANNOUNCEMENTS_ENDPOINT_NAME,
    label: 'Announcements (fetch from HR)',
    direction: 'INBOUND',
    defaultHttpMethod: 'GET',
    description:
      "Reads the company's announcements from the HR system for the mobile app (GET /api/hr/announcements). The path may " +
      "use {{shortname}} and {{employeeId}}. Map the HR system's response fields to these.",
    fields: [
      { field: 'companyId', label: 'Company ID' },
      { field: 'announcementId', label: 'Announcement ID' },
      { field: 'title', label: 'Title' },
      { field: 'message', label: 'Message' },
      { field: 'postedOn', label: 'Posted On' },
      { field: 'expiresOn', label: 'Expires On' },
    ],
  },
];

export function findEndpointPurposeByName(name: string): EndpointPurposeDefinition | undefined {
  return ENDPOINT_PURPOSES.find((purpose) => purpose.name === name);
}

/** GET has no side effects on the external system and is always treated as reading data in; every other verb is treated as sending data out. No schema column stores this — see IntegrationEndpoint.direction's own doc comment. */
export function deriveEndpointDirection(httpMethod: EndpointHttpMethod): EndpointDirection {
  return httpMethod === 'GET' ? 'INBOUND' : 'OUTBOUND';
}
