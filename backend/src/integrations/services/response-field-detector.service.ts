import { Injectable } from '@nestjs/common';

export interface FieldDescriptor {
  /**
   * Structural path — e.g. "data[].employee.email" for a field found
   * inside every element of a "data" array, or "meta.page" for a plain
   * nested object field. "[]" marks an array boundary once, regardless of
   * how many actual elements the sampled array had — this is what makes
   * the path reusable as a FieldMapping.sourcePath template rather than a
   * one-off per-index path like "data[3].employee.email".
   */
  path: string;
  type: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
}

/** How many elements of any one array are inspected when detecting its shape. Keeps detection O(sample size) instead of O(response size) on a large payload — see the "avoid over-engineering" instruction. */
const MAX_ARRAY_SAMPLE = 5;

/**
 * Walks a sample JSON response body and reports its STRUCTURAL shape as a
 * flat list of paths — one entry per distinct field position, not one per
 * array element. This is what the task's "dynamic JSON response-field-
 * detection" requirement asks for: `data[].email`, not `data[0].email`,
 * `data[1].email`, ... for a 200-row response.
 *
 * Used both by EndpointsController's live /test route (detecting fields
 * from whatever the external API actually returned) and by the standalone
 * IntegrationToolsController.detectResponseFields route (detecting fields
 * from a pasted/previously-captured sample, with no live call at all).
 */
@Injectable()
export class ResponseFieldDetectorService {
  detect(sample: unknown): FieldDescriptor[] {
    const fields = new Map<string, FieldDescriptor['type']>();
    this.walk(sample, '', fields);
    return Array.from(fields.entries()).map(([path, type]) => ({ path, type }));
  }

  private walk(value: unknown, path: string, fields: Map<string, FieldDescriptor['type']>): void {
    if (Array.isArray(value)) {
      if (path) {
        fields.set(path, 'array');
      }
      const arrayPath = `${path}[]`;
      for (const element of value.slice(0, MAX_ARRAY_SAMPLE)) {
        this.walk(element, arrayPath, fields);
      }
      return;
    }

    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        if (path) {
          fields.set(path, 'object');
        }
        return;
      }
      for (const [key, child] of entries) {
        this.walk(child, path ? `${path}.${key}` : key, fields);
      }
      return;
    }

    if (!path) {
      // Root of the sample is a bare scalar — nothing structural to report.
      return;
    }

    const type = this.scalarType(value);
    // A field seen as null in one sampled array element but as a real
    // value in another is still reported usefully: null never overwrites
    // an already-recorded non-null type.
    if (!fields.has(path) || fields.get(path) === 'null') {
      fields.set(path, type);
    }
  }

  private scalarType(value: unknown): FieldDescriptor['type'] {
    if (value === null) return 'null';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }
}
