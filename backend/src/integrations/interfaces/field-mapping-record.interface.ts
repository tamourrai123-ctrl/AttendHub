import { FieldMappingTransform } from './field-mapping.interface';

/**
 * Persisted field mapping (integration_field_mapping row). Distinct from
 * the stateless FieldMapping in field-mapping.interface.ts (still used
 * unchanged by the standalone preview endpoint) — this is the on-disk
 * shape, which carries identity/ownership/ordering/status columns the
 * stateless domain object has no reason to know about.
 *
 * transformConfig holds ONLY data, validated per transformType by
 * FieldMappingService.validateTransformConfig() before it's ever written —
 * see that method's doc comment for the exact shape each transform type
 * requires. It is never evaluated as code.
 *
 * status follows this project's plain Y/N convention directly (not the
 * ACTIVE/INACTIVE label EndpointStatus uses) — Phase 4F explicitly calls
 * for the existing Y/N vocabulary here, not a new one.
 */
export interface FieldMappingRecord {
  id: string;
  companyId: string;
  integrationId: string;
  endpointId: string;
  sourcePath: string;
  targetField: string;
  transformType: FieldMappingTransform;
  transformConfig: Record<string, unknown>;
  sortOrder: number;
  status: 'Y' | 'N';
}
