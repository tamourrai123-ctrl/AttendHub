/**
 * Shape returned by the endpoint (integration_detail) CRUD API.
 *
 * `endpoint` stores the full relative path INCLUDING any static query
 * string (e.g. "/employees?status=active"). Dynamic parts of that path can
 * use "{{name}}" placeholders, filled in at test/execute time from the
 * caller-supplied queryParams (see IntegrationEndpointExecutorService) —
 * integration_detail has no column for structured/typed named parameters,
 * so this is a schema-respecting, documented convention rather than a new
 * "query_params" table or column. See the final report's minimum-schema
 * recommendations for what a dedicated column would add.
 */
export type EndpointHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type EndpointPayloadType = 'JSON' | 'XML' | 'FORM';
/** Who may call a custom endpoint through the app routes (/hr/custom/...): the company admin only, or admin and employees. */
export type EndpointCallableBy = 'ADMIN' | 'ALL';

export type EndpointStatus = 'ACTIVE' | 'INACTIVE';

/**
 * Whether this endpoint brings data IN from the HR system (Inbound) or
 * sends data OUT to it (Outbound) — Phase 2 (Endpoints/Mapping tab).
 * integration_detail has no column for this (no schema change was made for
 * it, per this project's established "reuse existing columns via
 * convention" pattern — see reserved-endpoint-names.constant.ts for the
 * same approach applied to purpose). It is instead derived, always the same
 * way, from httpMethod: GET has no side effects on the external system and
 * is always a read; every other verb is always a write. Every real endpoint
 * this codebase's own reserved purposes define fits that rule exactly (see
 * constants/endpoint-purposes.constant.ts) — computed once in
 * PrismaEndpointsRepository.toEndpoint() so every caller (API response,
 * EndpointsService validation) sees the same value rather than
 * recomputing it.
 */
export type EndpointDirection = 'INBOUND' | 'OUTBOUND';

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
  /**
   * Super Admin switch (integration_detail.field_mapping_enabled, 'Y'/'N', default 'N'). When true the custom
   * field mapping section is shown to the Company Admin on this endpoint; when false it is hidden and the
   * mapping routes refuse writes. Mappings already saved keep being applied either way.
   */
  fieldMappingEnabled: boolean;
  /** integration_detail.callable_by ('A' = ADMIN, default; 'E' = ALL). Only used by custom (non-reserved) endpoints. */
  callableBy: EndpointCallableBy;
  /** Number of active field mappings on this endpoint. Filled only by the list route (one query for the whole page); undefined elsewhere. */
  activeMappingCount?: number;
}
