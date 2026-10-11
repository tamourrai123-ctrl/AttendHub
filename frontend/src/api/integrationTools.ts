import { apiClient, type ApiSuccessResponse } from "./client";
import type { FieldMappingRecord } from "../types/fieldMapping";

/**
 * Stateless integration utility routes — backend/src/integrations/integration-tools.controller.ts
 * (/integrations/tools/...). None of these touch a specific company's data
 * or credentials, so none needs a companyId.
 *
 * Used by EndpointsPanel/FieldMappingEditor to dry-run a mapping for an
 * OUTBOUND (e.g. ATTENDANCE_POST) endpoint WITHOUT making a real call to
 * the external HR system — sending a live POST there would create a real,
 * fake attendance record on the company's actual HR software. Inbound
 * (GET) endpoints use the real testEndpoint() call instead (see
 * api/endpoints.ts) since a GET has no side effects.
 */

/**
 * Request-body shape backend/src/integrations/dto/preview-field-mapping.dto.ts
 * actually expects — NOT the persisted FieldMappingRecord shape
 * (transformType/transformConfig). Mirrors the stateless FieldMapping
 * domain interface (transform/valueMap/defaultValue) that
 * FieldMappingService.apply() has always taken.
 */
export interface PreviewMapping {
  sourcePath: string;
  targetField: string;
  transform?: FieldMappingRecord["transformType"];
  valueMap?: Record<string, string>;
  defaultValue?: string;
}

/** Adapts a persisted mapping into the preview request shape — mirrors the backend's FieldMappingService.toDomainMapping() exactly. */
export function toPreviewMapping(record: FieldMappingRecord): PreviewMapping {
  const config = record.transformConfig ?? {};
  return {
    sourcePath: record.sourcePath,
    targetField: record.targetField,
    transform: record.transformType,
    valueMap: config.valueMap as Record<string, string> | undefined,
    defaultValue: config.defaultValue as string | undefined,
  };
}

export async function previewFieldMapping(sampleRecord: Record<string, unknown>, mappings: PreviewMapping[]): Promise<Record<string, unknown>> {
  const response = await apiClient.post<ApiSuccessResponse<{ mapped: Record<string, unknown> }>>(
    "/integrations/tools/preview-field-mapping",
    { sampleRecord, mappings },
  );
  return response.data.mapped;
}
