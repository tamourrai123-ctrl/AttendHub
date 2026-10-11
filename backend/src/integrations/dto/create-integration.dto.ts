import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, Length } from 'class-validator';

/**
 * Fields map directly onto integration_master columns (see the
 * Integrations migration report, section A/B).
 *
 * companyId is intentionally NOT a field here. Creating an integration is a
 * Company-Admin-only action (RBAC revision: connection ownership moved from
 * Super Admin to Company Admin) and always applies to the caller's own
 * company — the controller derives companyId from the authenticated
 * session (@CurrentUser()) and passes it to the service/repository
 * separately, the same way UpdateIntegrationDto already excludes companyId
 * because identity is immutable after creation. A client-supplied companyId
 * here would let a Company Admin create a record under a different
 * company's id.
 *
 * integrationType/authType are short LOV-style codes: format-validated
 * only (non-empty, max 3 characters, matching integration_master's
 * VARCHAR(3) columns) since app_lov_detail is not populated yet — no
 * hard-coded whitelist, no database foreign key. This mirrors how
 * usm_company.country was handled in the Companies migration. The old
 * enum values (API_KEY / BEARER_TOKEN / BASIC_AUTH / OAUTH2) no longer
 * apply — they don't fit the real schema.
 *
 * apiKey/apiSecret are required and are the real credentials stored in
 * integration_master.api_key/api_secret. They are never echoed back by any
 * endpoint — see the Integration response interface.
 */
export class CreateIntegrationDto {
  // Definite-assignment assertions (!) on required fields: these DTOs are
  // populated by Nest's ValidationPipe via class-transformer, never by
  // `new CreateIntegrationDto()`, so strictPropertyInitialization can't
  // see that the fields are actually assigned.

  @ApiProperty({ example: 'HRS', description: 'Integration type LOV code (integration_master.integration_type), max 3 characters. Not yet validated against app_lov_detail — that LOV is not populated yet.' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 3)
  integrationType!: string;

  @ApiProperty({ example: 'KEY', description: 'Auth type LOV code (integration_master.auth_type), max 3 characters. Not yet validated against app_lov_detail — that LOV is not populated yet.' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 3)
  authType!: string;

  @ApiProperty({ example: 'https://api.example-hr.com' })
  @IsUrl({ require_tld: false })
  baseUrl!: string;

  @ApiProperty({ description: 'Stored in integration_master.api_key. Never returned by any endpoint, never logged.' })
  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @ApiProperty({ description: 'Stored in integration_master.api_secret. Never returned by any endpoint, never logged.' })
  @IsString()
  @IsNotEmpty()
  apiSecret!: string;
}
