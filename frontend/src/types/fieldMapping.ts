/**
 * Matches the real backend's persisted field mapping (integration_field_mapping)
 * shape exactly — see backend/src/integrations/interfaces/field-mapping-record.interface.ts
 * and dto/{create,update}-field-mapping.dto.ts. Phase 2 (Company Admin —
 * Endpoints/Mapping tab).
 */
export type FieldMappingTransform =
  | "NONE"
  | "TRIM"
  | "UPPERCASE"
  | "LOWERCASE"
  | "TO_STRING"
  | "DATE_ISO"
  | "VALUE_MAP"
  | "DEFAULT_IF_EMPTY";

/** Plain Y/N, matching this project's existing convention (not ACTIVE/INACTIVE — see the backend interface's doc comment). */
export type FieldMappingStatus = "Y" | "N";

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
  status: FieldMappingStatus;
}

/**
 * sourcePath must use the structural "[]" array marker (e.g. "data[].field"),
 * never a numeric index like "data[0].field" — enforced server-side, see
 * CreateFieldMappingDto's doc comment.
 */
export interface CreateFieldMappingInput {
  sourcePath: string;
  targetField: string;
  transformType?: FieldMappingTransform;
  transformConfig?: Record<string, unknown>;
  sortOrder?: number;
  status?: FieldMappingStatus;
}

export interface UpdateFieldMappingInput {
  sourcePath?: string;
  targetField?: string;
  transformType?: FieldMappingTransform;
  transformConfig?: Record<string, unknown>;
  sortOrder?: number;
  status?: FieldMappingStatus;
}

export interface FieldMappingListResult {
  items: FieldMappingRecord[];
  page: number;
  limit: number;
  total: number;
}
