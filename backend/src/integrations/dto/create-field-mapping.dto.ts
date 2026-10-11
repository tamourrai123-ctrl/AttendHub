import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { FieldMappingTransform } from '../interfaces/field-mapping.interface';

export const TRANSFORM_TYPES: FieldMappingTransform[] = [
  'NONE',
  'TRIM',
  'UPPERCASE',
  'LOWERCASE',
  'TO_STRING',
  'DATE_ISO',
  'VALUE_MAP',
  'DEFAULT_IF_EMPTY',
];

export const FIELD_MAPPING_STATUSES = ['Y', 'N'] as const;
export type FieldMappingStatusCode = (typeof FIELD_MAPPING_STATUSES)[number];

/**
 * Fields map onto integration_field_mapping columns. companyId/integrationId/
 * endpointId are deliberately NOT part of this DTO — they come from the
 * resolved, tenant-checked companyId and the route params
 * (:integrationId/:endpointId), never the request body, the same pattern
 * CreateEndpointDto already uses for integration_detail.
 *
 * sourcePath must follow ResponseFieldDetectorService's STRUCTURAL format
 * (e.g. "data[].employee_id" — "[]" marks an array boundary once). A
 * per-index path like "data[0].employee_id" is rejected here: it would only
 * ever describe one specific array element instead of the field's position
 * across every element, which defeats the entire point of persisting a
 * reusable mapping.
 *
 * transformConfig's exact required/allowed shape depends on transformType —
 * see FieldMappingService.validateTransformConfig(), which the service
 * layer calls before every create/update. This DTO only checks that it is a
 * plain object; the per-type structural check happens in exactly one place
 * (the engine) so the two rules can never drift apart into two different
 * definitions of "valid".
 */
export class CreateFieldMappingDto {
  @ApiProperty({ example: 'data[].employee_id' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  @Matches(/^(?!.*\[\d+\]).+$/, {
    message:
      'sourcePath must use the structural "[]" array marker (e.g. "data[].field"), not a numeric index like "data[0].field".',
  })
  sourcePath!: string;

  @ApiProperty({ example: 'profile.employeeId' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  targetField!: string;

  @ApiProperty({ required: false, enum: TRANSFORM_TYPES, default: 'NONE' })
  @IsOptional()
  @IsIn(TRANSFORM_TYPES)
  transformType?: FieldMappingTransform;

  @ApiProperty({
    required: false,
    default: {},
    description: 'Shape depends on transformType — see FieldMappingService.validateTransformConfig(). Data only, never evaluated as code.',
  })
  @IsOptional()
  @IsObject()
  transformConfig?: Record<string, unknown>;

  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiProperty({ required: false, enum: FIELD_MAPPING_STATUSES, default: 'Y' })
  @IsOptional()
  @IsIn(FIELD_MAPPING_STATUSES)
  status?: FieldMappingStatusCode;
}
