import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { IntegrationStatus } from '../interfaces/integration.interface';

const STATUSES: IntegrationStatus[] = ['CONNECTED', 'DISCONNECTED'];

/**
 * Body for the Super-Admin-only activate/deactivate route
 * (PATCH /integrations/:id/status). Deliberately carries nothing but
 * `status` — Super Admin can toggle a company's integration on/off, but
 * must never be able to see or change integrationType/authType/baseUrl/
 * apiKey/apiSecret through this route. Full configuration edits go through
 * UpdateIntegrationDto instead (PATCH /integrations/:id), which is now
 * Company-Admin-only.
 */
export class UpdateIntegrationStatusDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status!: IntegrationStatus;
}
