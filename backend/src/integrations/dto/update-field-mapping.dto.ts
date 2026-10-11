import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { FieldMappingTransform } from '../interfaces/field-mapping.interface';
import { FIELD_MAPPING_STATUSES, FieldMappingStatusCode, TRANSFORM_TYPES } from './create-field-mapping.dto';

export class UpdateFieldMappingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  @Matches(/^(?!.*\[\d+\]).+$/, {
    message:
      'sourcePath must use the structural "[]" array marker (e.g. "data[].field"), not a numeric index like "data[0].field".',
  })
  sourcePath?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  targetField?: string;

  @ApiProperty({ required: false, enum: TRANSFORM_TYPES })
  @IsOptional()
  @IsIn(TRANSFORM_TYPES)
  transformType?: FieldMappingTransform;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  transformConfig?: Record<string, unknown>;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiProperty({ required: false, enum: FIELD_MAPPING_STATUSES })
  @IsOptional()
  @IsIn(FIELD_MAPPING_STATUSES)
  status?: FieldMappingStatusCode;
}
