import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, Length } from 'class-validator';
import { IntegrationStatus } from '../interfaces/integration.interface';

const STATUSES: IntegrationStatus[] = ['CONNECTED', 'DISCONNECTED'];

/**
 * companyId is intentionally absent — identity is immutable after creation
 * (same rule as CompaniesModule's UpdateCompanyDto). apiKey/apiSecret are
 * optional here to support credential rotation without requiring both on
 * every update. status is restricted to the two values integration_master
 * can actually represent (CHECK (status IN ('Y','N'))) — WARNING/ERROR/
 * TESTING from the old in-memory model are no longer accepted.
 */
export class UpdateIntegrationDto {
  @ApiProperty({ required: false, description: 'integration_master.integration_type, max 3 characters.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 3)
  integrationType?: string;

  @ApiProperty({ required: false, description: 'integration_master.auth_type, max 3 characters.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 3)
  authType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @ApiProperty({ required: false, description: 'Rotates integration_master.api_key. Never returned by any endpoint, never logged.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apiKey?: string;

  @ApiProperty({ required: false, description: 'Rotates integration_master.api_secret. Never returned by any endpoint, never logged.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apiSecret?: string;

  @ApiProperty({ required: false, enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: IntegrationStatus;
}
