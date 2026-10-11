import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { FieldMappingTransform } from '../interfaces/field-mapping.interface';

const TRANSFORMS: FieldMappingTransform[] = [
  'NONE',
  'TRIM',
  'UPPERCASE',
  'LOWERCASE',
  'TO_STRING',
  'DATE_ISO',
  'VALUE_MAP',
  'DEFAULT_IF_EMPTY',
];

export class FieldMappingDto {
  @ApiProperty({ example: 'employee.email' })
  @IsString()
  @IsNotEmpty()
  sourcePath!: string;

  @ApiProperty({ example: 'email' })
  @IsString()
  @IsNotEmpty()
  targetField!: string;

  @ApiProperty({ required: false, enum: TRANSFORMS, default: 'NONE' })
  @IsOptional()
  @IsIn(TRANSFORMS)
  transform?: FieldMappingTransform;

  @ApiProperty({ required: false, type: Object, example: { M: 'Male', F: 'Female' } })
  @IsOptional()
  @IsObject()
  valueMap?: Record<string, string>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  defaultValue?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  inputFormat?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  outputFormat?: string;
}

/**
 * Stateless mapping-preview endpoint's request body. There is no
 * persistence of these mappings — see field-mapping.interface.ts. The
 * caller supplies both the mappings AND a sample source record on every
 * call; sampleRecord is typically the output of the response-field
 * detection / test-endpoint flow, pasted or selected by the frontend.
 */
export class PreviewFieldMappingDto {
  @ApiProperty({ type: Object, description: 'One already-unwrapped sample record to map (e.g. one element of a detected array).' })
  @IsObject()
  sampleRecord!: Record<string, unknown>;

  @ApiProperty({ type: [FieldMappingDto] })
  @ValidateNested({ each: true })
  @Type(() => FieldMappingDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  mappings!: FieldMappingDto[];
}
