import { BadRequestException, Injectable } from '@nestjs/common';
import { MAX_DATE_PATTERN_LENGTH, transformDate } from '../utils/date-format.util';
import { FieldMapping, FieldMappingTransform } from '../interfaces/field-mapping.interface';
import { FieldMappingRecord } from '../interfaces/field-mapping-record.interface';

/**
 * Applies a caller-supplied list of FieldMapping rules to ONE already-
 * unwrapped source record, producing a new plain object. Stateless — see
 * field-mapping.interface.ts for why this has no persistence layer.
 *
 * Deliberately operates on a single record, not a whole response body: a
 * ResponseFieldDetectorService path like "data[].email" describes the
 * SHAPE across an array, but applying a mapping is naturally a per-element
 * operation (map each element of `data` individually). Callers that have
 * an array (e.g. a live test response's `data` field) are expected to
 * call apply() once per element; this keeps the mapping logic itself
 * simple and independently testable, per "avoid over-engineering".
 *
 * Transform set is fixed and safe — see FieldMappingTransform. There is no
 * "custom expression"/"script" transform and this class never evaluates
 * caller-supplied code of any kind.
 */
@Injectable()
export class FieldMappingService {
  apply(sourceRecord: Record<string, unknown>, mappings: FieldMapping[]): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const mapping of mappings) {
      const rawValue = this.resolvePath(sourceRecord, mapping.sourcePath);
      const value = this.applyTransform(rawValue, mapping);
      this.setPath(output, mapping.targetField, value);
    }
    return output;
  }

  /** True when at least one mapping's source field exists in the record. False means the record does not use these mappings' field names. */
  matchesAny(sourceRecord: Record<string, unknown>, mappings: FieldMapping[]): boolean {
    return mappings.some((mapping) => this.resolvePath(sourceRecord, mapping.sourcePath) !== undefined);
  }

  private resolvePath(record: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      return (current as Record<string, unknown>)[key];
    }, record);
  }

  private setPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let cursor = target;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      const existing = cursor[key];
      if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[keys[keys.length - 1]] = value;
  }

  private applyTransform(rawValue: unknown, mapping: FieldMapping): unknown {
    const transform = mapping.transform ?? 'NONE';

    if (rawValue === undefined || rawValue === null) {
      return mapping.defaultValue !== undefined ? mapping.defaultValue : null;
    }

    switch (transform) {
      case 'NONE':
        return rawValue;
      case 'TRIM':
        return String(rawValue).trim();
      case 'UPPERCASE':
        return String(rawValue).toUpperCase();
      case 'LOWERCASE':
        return String(rawValue).toLowerCase();
      case 'TO_STRING':
        return String(rawValue);
      case 'DATE_ISO': {
        const converted = transformDate(rawValue, mapping.inputFormat, mapping.outputFormat);
        return converted === null ? (mapping.defaultValue ?? null) : converted;
      }
      case 'VALUE_MAP': {
        const key = String(rawValue);
        const mapped = mapping.valueMap?.[key];
        return mapped !== undefined ? mapped : (mapping.defaultValue ?? rawValue);
      }
      case 'DEFAULT_IF_EMPTY':
        // rawValue is already known non-null/undefined at this point.
        return rawValue;
      default:
        return rawValue;
    }
  }

  // --- Phase 4F additions: bridge for the persisted (integration_field_mapping) records. ---
  // Everything above this line is unchanged from the stateless preview-only
  // implementation — apply()/resolvePath()/setPath()/applyTransform() are
  // still the ONLY place a mapping is ever actually applied to data,
  // whether the mapping came from a one-off preview request or a persisted
  // record. The methods below only adapt persisted records into that same
  // engine; they add no second way of transforming a value.

  /**
   * Structural validation of transform_config, per transformType. Called by
   * FieldMappingsService before every create/update so a malformed config
   * is rejected with 400 before it ever reaches the database — the DB-level
   * chk_ifm_transform_type CHECK constraint only guarantees transform_type
   * itself is one of the 8 known values; it can't validate the shape of an
   * arbitrary JSONB blob, so this is where that per-type shape is enforced.
   *
   * Rules (deliberately simple — every transform accepts at most the two
   * keys below, never arbitrary caller-supplied keys):
   *   - Every transform type MAY include `defaultValue: string` — the same
   *     "fallback when the source value is missing" behavior applyTransform()
   *     already gives every transform, just made explicit and persisted.
   *   - VALUE_MAP additionally REQUIRES `valueMap`: a non-empty object whose
   *     values are all strings (mirrors FieldMapping.valueMap exactly).
   *   - DEFAULT_IF_EMPTY additionally REQUIRES `defaultValue` — that
   *     transform has no meaning without one.
   *   - No other keys are accepted for any transform type; transformConfig
   *     is data only and is never evaluated as code.
   */
  validateTransformConfig(transformType: FieldMappingTransform, transformConfig: Record<string, unknown>): void {
    const config = transformConfig ?? {};
    const allowedKeys =
      transformType === 'VALUE_MAP' ? ['valueMap', 'defaultValue'] : transformType === 'DATE_ISO' ? ['defaultValue', 'inputFormat', 'outputFormat'] : ['defaultValue'];
    for (const key of ['inputFormat', 'outputFormat']) {
      const v = (config as Record<string, unknown>)[key];
      if (v !== undefined && (typeof v !== 'string' || v.length > MAX_DATE_PATTERN_LENGTH)) {
        throw new BadRequestException(`transformConfig.${key} must be a text pattern of at most ${MAX_DATE_PATTERN_LENGTH} characters.`);
      }
    }

    for (const key of Object.keys(config)) {
      if (!allowedKeys.includes(key)) {
        throw new BadRequestException(`transformConfig for transform type ${transformType} does not accept "${key}".`);
      }
    }

    if ('defaultValue' in config && typeof config.defaultValue !== 'string') {
      throw new BadRequestException('transformConfig.defaultValue must be a string.');
    }

    if (transformType === 'VALUE_MAP') {
      const valueMap = config.valueMap;
      if (typeof valueMap !== 'object' || valueMap === null || Array.isArray(valueMap) || Object.keys(valueMap).length === 0) {
        throw new BadRequestException('transformConfig.valueMap is required for VALUE_MAP and must be a non-empty object of string values.');
      }
      for (const [key, value] of Object.entries(valueMap as Record<string, unknown>)) {
        if (typeof value !== 'string') {
          throw new BadRequestException(`transformConfig.valueMap["${key}"] must be a string.`);
        }
      }
    }

    if (transformType === 'DEFAULT_IF_EMPTY' && typeof config.defaultValue !== 'string') {
      throw new BadRequestException('transformConfig.defaultValue is required for DEFAULT_IF_EMPTY.');
    }
  }

  /** Adapts one persisted record into the stateless FieldMapping shape apply() already understands. */
  toDomainMapping(record: FieldMappingRecord): FieldMapping {
    const config = record.transformConfig ?? {};
    return {
      sourcePath: record.sourcePath,
      targetField: record.targetField,
      transform: record.transformType,
      valueMap: config.valueMap as Record<string, string> | undefined,
      defaultValue: config.defaultValue as string | undefined,
      inputFormat: config.inputFormat as string | undefined,
      outputFormat: config.outputFormat as string | undefined,
    };
  }

  /**
   * Applies a set of mappings to a whole response BODY rather than one
   * already-unwrapped record — the piece apply() itself deliberately leaves
   * to its callers (see apply()'s own doc comment). Persisted sourcePaths
   * follow ResponseFieldDetectorService's structural format
   * ("data[].employee.email"), so this detects the shared array prefix
   * ("data[]"), resolves that array in the body, strips the prefix down to
   * an element-relative path for each mapping, and calls apply() once per
   * element — exactly the "call apply() once per element" pattern apply()'s
   * doc comment already describes, just automated instead of left to the
   * caller.
   *
   * If no mapping's sourcePath contains "[]" at all, there is no array to
   * unwrap — the whole body is treated as a single record.
   *
   * Deliberate, documented limitation: this assumes every mapping in the
   * set shares the SAME array prefix (one endpoint's mapping set maps one
   * response array). A mapping set spanning two different top-level arrays
   * is an edge case out of scope for this phase — only the first prefix
   * found is used, and mappings that don't share it will simply resolve to
   * their default/null against the wrong element rather than being
   * silently misapplied to a different array.
   */
  applyToResponse(body: unknown, mappings: FieldMapping[]): unknown {
    if (mappings.length === 0) {
      return {};
    }

    const prefix = mappings.map((mapping) => this.arrayPrefixOf(mapping.sourcePath)).find((candidate) => candidate !== undefined);

    if (!prefix) {
      // Oracle ORDS (and similar) wrap rows as { "items": [ {...} ], "first": {...} }. An admin who maps a plain
      // field like "companyid" means the field INSIDE each row, so when none of the mapped paths exist at the top
      // level but the body has an `items` array, map each row instead of the wrapper. Bodies that already work
      // (paths found at the top level, or no `items` array) behave exactly as before.
      const rows = this.ordsItemsRows(body, mappings);
      if (rows) {
        return rows.map((row) => this.apply((row ?? {}) as Record<string, unknown>, mappings));
      }
      return this.apply((body ?? {}) as Record<string, unknown>, mappings);
    }

    const arrayFieldPath = prefix.slice(0, -2); // drop the trailing "[]"
    const arrayValue = arrayFieldPath ? this.resolvePath(body, arrayFieldPath) : body;

    if (!Array.isArray(arrayValue)) {
      return [];
    }

    const elementMappings = mappings.map((mapping) => ({
      ...mapping,
      sourcePath: this.stripArrayPrefix(mapping.sourcePath, prefix),
    }));

    return arrayValue.map((element) => this.apply((element ?? {}) as Record<string, unknown>, elementMappings));
  }

  /** The rows of an ORDS-style `{ items: [...] }` body, but only when no mapped path resolves at the body's top level. */
  private ordsItemsRows(body: unknown, mappings: FieldMapping[]): unknown[] | undefined {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return undefined;
    }
    const items = (body as Record<string, unknown>).items;
    if (!Array.isArray(items)) {
      return undefined;
    }
    const anyAtTopLevel = mappings.some((mapping) => this.resolvePath(body, mapping.sourcePath) !== undefined);
    return anyAtTopLevel ? undefined : items;
  }

  /** Returns the "prefix[]" portion of a structural path, or undefined if it has no array boundary. */
  private arrayPrefixOf(path: string): string | undefined {
    const idx = path.indexOf('[]');
    return idx === -1 ? undefined : path.slice(0, idx + 2);
  }

  /** Strips a shared "prefix[]." off a structural path, leaving an element-relative dot path apply() can resolve. Paths that don't share the prefix are returned unchanged (see applyToResponse()'s doc comment). */
  private stripArrayPrefix(path: string, prefix: string): string {
    if (path === prefix) {
      return '';
    }
    if (path.startsWith(`${prefix}.`)) {
      return path.slice(prefix.length + 1);
    }
    return path;
  }
}
