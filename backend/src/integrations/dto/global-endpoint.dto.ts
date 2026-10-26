import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const GLOBAL_ENDPOINT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,59}$/;

export class GlobalEndpointFieldDto {
  @IsString()
  @Length(1, 60)
  @Matches(/^[A-Za-z0-9_.\-\[\]]+$/, { message: 'field may only contain letters, digits and _ . - [ ].' })
  field!: string;

  @IsString()
  @Length(1, 100)
  label!: string;
}

export class CreateGlobalEndpointDto {
  @ApiProperty({ example: 'DAILY_REPORT', description: 'Letters, digits, "_" and "-". Used in the app route, so no spaces.' })
  @IsString()
  @Matches(GLOBAL_ENDPOINT_NAME_PATTERN, {
    message: 'name must start with a letter and use only letters, digits, "_" or "-" (2–60 characters).',
  })
  name!: string;

  @ApiProperty({ example: 'Daily report' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  label!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiProperty({ enum: ['INBOUND', 'OUTBOUND'] })
  @IsIn(['INBOUND', 'OUTBOUND'])
  direction!: 'INBOUND' | 'OUTBOUND';

  @ApiProperty({ required: false, enum: ['GET', 'POST'], description: 'Defaults to GET for Inbound and POST for Outbound.' })
  @IsOptional()
  @IsIn(['GET', 'POST'])
  defaultHttpMethod?: 'GET' | 'POST';

  @ApiProperty({ required: false, type: [GlobalEndpointFieldDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GlobalEndpointFieldDto)
  fields?: GlobalEndpointFieldDto[];

  @ApiProperty({ required: false, enum: ['ADMIN', 'ALL'], description: 'ADMIN (default) = company admin only; ALL = admin and employees.' })
  @IsOptional()
  @IsIn(['ADMIN', 'ALL'])
  callableBy?: 'ADMIN' | 'ALL';
}

/** The name is fixed once created: company endpoints already refer to it. */
export class UpdateGlobalEndpointDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  label?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @IsOptional()
  @IsIn(['INBOUND', 'OUTBOUND'])
  direction?: 'INBOUND' | 'OUTBOUND';

  @IsOptional()
  @IsIn(['GET', 'POST'])
  defaultHttpMethod?: 'GET' | 'POST';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GlobalEndpointFieldDto)
  fields?: GlobalEndpointFieldDto[];

  @IsOptional()
  @IsIn(['ADMIN', 'ALL'])
  callableBy?: 'ADMIN' | 'ALL';

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class ListGlobalEndpointsDto extends PaginationQueryDto {}
