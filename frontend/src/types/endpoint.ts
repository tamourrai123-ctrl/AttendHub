/**
 * Matches the real backend's endpoint (integration_detail) shape exactly —
 * see backend/src/integrations/interfaces/endpoint.interface.ts. Phase 2
 * (Company Admin — Endpoints/Mapping tab).
 */
export type EndpointHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type EndpointPayloadType = "JSON" | "XML" | "FORM";
/** Custom endpoints only: who may call them from the app. */
export type EndpointCallableBy = "ADMIN" | "ALL";
export type EndpointStatus = "ACTIVE" | "INACTIVE";

/**
 * INBOUND = brings data in from the HR system (always a GET, read-only).
 * OUTBOUND = sends data out to the HR system (POST/PUT/PATCH/DELETE).
 * Computed by the backend from httpMethod — there is no separate field to
 * set; picking a Purpose (see EndpointPurpose) picks this for you.
 */
export type EndpointDirection = "INBOUND" | "OUTBOUND";

export interface IntegrationEndpoint {
  id: string;
  companyId: string;
  integrationId: string;
  name: string;
  description: string | null;
  endpoint: string;
  httpMethod: EndpointHttpMethod;
  direction: EndpointDirection;
  requestType: EndpointPayloadType;
  responseType: EndpointPayloadType;
  sortOrder: number;
  status: EndpointStatus;
  /** Super Admin switch, off by default. When true the Company Admin sees the custom field mapping section on this endpoint; saved mappings apply either way. */
  fieldMappingEnabled: boolean;
  callableBy: EndpointCallableBy;
}

export interface CreateEndpointInput {
  name: string;
  description?: string;
  endpoint: string;
  httpMethod: EndpointHttpMethod;
  requestType: EndpointPayloadType;
  responseType: EndpointPayloadType;
  sortOrder?: number;
  callableBy?: EndpointCallableBy;
}

export interface UpdateEndpointInput {
  name?: string;
  description?: string;
  endpoint?: string;
  httpMethod?: EndpointHttpMethod;
  requestType?: EndpointPayloadType;
  responseType?: EndpointPayloadType;
  sortOrder?: number;
  callableBy?: EndpointCallableBy;
  status?: EndpointStatus;
}

export interface EndpointListResult {
  items: IntegrationEndpoint[];
  page: number;
  limit: number;
  total: number;
}

/** One field the response actually contained, detected structurally (e.g. "data[].emp_code") — see ResponseFieldDetectorService. */
export interface FieldDescriptor {
  path: string;
  type: "string" | "number" | "boolean" | "null" | "object" | "array";
}

export interface TestEndpointResult {
  success: boolean;
  statusCode: number;
  durationMs: number;
  error?: string;
  sampleBody?: unknown;
  detectedFields?: FieldDescriptor[];
  /** Only present once this endpoint has at least one active field mapping. */
  mappedSample?: unknown;
  /** POST test only: the body the hub built from the sample record and the mappings and sent to HR. */
  sentBody?: unknown;
  sentAsIs?: boolean;
}

/** One AttendHub-side field a mapping on a "purpose" endpoint may use — see backend's endpoint-purposes.constant.ts. */
export interface EndpointPurposeField {
  field: string;
  label: string;
}

export interface EndpointPurpose {
  name: string;
  label: string;
  direction: EndpointDirection;
  defaultHttpMethod: EndpointHttpMethod;
  /** True for purposes the HR API document does not list — not offered in the Add-endpoint picker. */
  hideFromPicker?: boolean;
  /** Present only when the purpose accepts more than one method (e.g. EMPLOYEE_LOGIN: POST or GET). */
  allowedHttpMethods?: EndpointHttpMethod[];
  description: string;
  /** Single-direction purposes (ATTENDANCE_FETCH/ATTENDANCE_POST/LEAVE/EMPLOYEES): the one fixed AttendHub-side field list. Empty for a bidirectional purpose — see requestFields/responseFields below. */
  fields: EndpointPurposeField[];
  /**
   * Present only for a bidirectional purpose (e.g. EMPLOYEE_LOGIN), which
   * needs mappings going BOTH ways on the same endpoint: some mappings send
   * an AttendHub value out (sourcePath drawn from requestFields), others
   * read a value back from the HR response (targetField drawn from
   * responseFields) — see backend's endpoint-purposes.constant.ts and
   * FieldMappingsService.assertFieldAllowedForPurpose().
   */
  requestFields?: EndpointPurposeField[];
  responseFields?: EndpointPurposeField[];
}
