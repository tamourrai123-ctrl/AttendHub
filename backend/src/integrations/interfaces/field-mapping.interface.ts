/**
 * Custom field-mapping domain abstraction.
 *
 * Inspection (scripts/inspect-hr-integration-foundation.ts, step 5 — a
 * search of information_schema.tables for any table named like
 * %map%/%field%) found NO existing table that could store field mappings,
 * and a grep of the backend's src/ tree found no existing mapping
 * module either. Per the task's explicit instruction — "before creating
 * any new mapping table, inspect the actual schema... if none exists,
 * implement only the service/domain abstraction, and separately recommend
 * a minimum schema rather than creating a new table unilaterally" — this
 * feature is implemented as a pure, stateless domain service
 * (FieldMappingService) with NO persistence of its own. A mapping
 * definition (a FieldMapping[]) is supplied by the caller on every request
 * (see PreviewFieldMappingDto) rather than being stored server-side.
 *
 * The final report's minimum-schema-recommendation section proposes the
 * table shape a future phase would add if/when mappings need to be saved
 * and reused rather than supplied ad hoc on each call.
 *
 * Transformations are a SAFE, FIXED set only — there is no "expression" or
 * "script" transform, and no code (of any language) is ever evaluated
 * against source data. This is a deliberate, non-negotiable boundary from
 * the task's instructions, not an oversight.
 */
export type FieldMappingTransform =
  | 'NONE'
  | 'TRIM'
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'TO_STRING'
  | 'DATE_ISO'
  | 'VALUE_MAP'
  | 'DEFAULT_IF_EMPTY';

export interface FieldMapping {
  /**
   * Dot-notation path into the source record, e.g. "employee.email" or
   * "address.city". Does not support the "[]" structural-array notation
   * ResponseFieldDetectorService reports (that notation describes the
   * SHAPE of a response across an array; FieldMappingService is applied to
   * one already-unwrapped record/element at a time — see
   * FieldMappingService's own doc comment for why).
   */
  sourcePath: string;
  /** Dot-notation path to write into the output record; intermediate objects are created as needed. */
  targetField: string;
  transform?: FieldMappingTransform;
  /** Required, and only used, when transform is 'VALUE_MAP'. Keys are matched against the (string-coerced) source value. */
  valueMap?: Record<string, string>;
  /** Used when transform is 'DEFAULT_IF_EMPTY', or as the fallback for any transform when the source path resolves to undefined/null. */
  defaultValue?: string;
  /** DATE_ISO only: how the HR/app date is written (e.g. "M/D/YYYY h:mm:ss.SSSSSS A"). Omit to detect automatically. */
  inputFormat?: string;
  /** DATE_ISO only: how the date must be written for the target (e.g. "YYYY-MM-DD HH:mm:ss", ISO, EPOCH). Omit for ISO. */
  outputFormat?: string;
}
